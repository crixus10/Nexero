import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';

const PROVIDER = 'stripe';
const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';

/**
 * SINGURUL loc din tot codul care poate activa/dezactiva un entitlement —
 * regula #4 din CLAUDE.md. Deliberat NEexportat din PaymentsModule (vezi
 * payments.module.ts) — niciun alt modul nu poate injecta acest serviciu
 * și "activa" ceva direct, nici din greșeală.
 */
@Injectable()
export class StripeWebhookService {
  private readonly logger = new Logger(StripeWebhookService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Idempotent: dacă event.id a mai fost procesat (retry Stripe), nu
   * repetă efectul de business — vezi docs/data-model.md. Inserarea în
   * processed_webhook_events și efectul de business (upsert pe
   * tenant_modules) se întâmplă în ACEEAȘI tranzacție: dacă efectul de
   * business eșuează (ex: metadata lipsă, vezi handleCheckoutSessionCompleted),
   * întreaga tranzacție face rollback — inclusiv insertul din
   * processed_webhook_events — ca evenimentul să NU rămână marcat
   * "procesat" fără să se fi întâmplat nimic. O coliziune pe event.id sub
   * concurență reală (retry paralel, nu doar secvențial) e prinsă de
   * constrângerea UNIQUE din DB, nu doar de un `findUnique` dinainte
   * (care ar avea o fereastră TOCTOU sub cereri simultane).
   */
  async handleEvent(event: Stripe.Event): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.processedWebhookEvent.create({
          data: { id: event.id, provider: PROVIDER, eventType: event.type },
        });
        await this.applyEvent(tx, event);
      });
    } catch (err) {
      if (this.isUniqueConstraintViolation(err)) {
        this.logger.log(
          `Event ${event.id} deja procesat — ignorat (idempotent).`,
        );
        return;
      }
      throw err;
    }
  }

  private isUniqueConstraintViolation(err: unknown): boolean {
    return (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === UNIQUE_CONSTRAINT_VIOLATION
    );
  }

  private async applyEvent(
    tx: Prisma.TransactionClient,
    event: Stripe.Event,
  ): Promise<void> {
    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleCheckoutSessionCompleted(tx, event);
        break;
      case 'invoice.payment_failed':
        await this.handleInvoicePaymentFailed(tx, event);
        break;
      default:
        this.logger.debug(
          `Event ${event.type} (${event.id}) — fără handler, ignorat.`,
        );
    }
  }

  /**
   * O sesiune de checkout fără metadata completă înseamnă client debitat
   * real de Stripe, dar fără nicio cale de a ști pe ce tenant/modul să
   * activăm — ARUNCĂ (nu doar loghează), ca tranzacția să facă rollback:
   * Stripe primește 5xx, reîncearcă și marchează evenimentul ca eșuat
   * vizibil în dashboard-ul lor (+ orice alertă de monitorizare pe erorile
   * propagate). Un `warn` urmat de `return` ar marca evenimentul
   * "procesat" definitiv, fără activare și fără nicio alertă — exact
   * scenariul "bani luați, acces neacordat, nimeni nu observă" pe care
   * vrem să-l evităm pe un flux de plată.
   */
  private async handleCheckoutSessionCompleted(
    tx: Prisma.TransactionClient,
    event: Stripe.Event,
  ): Promise<void> {
    const session = event.data.object as Stripe.Checkout.Session;
    const { tenantId, moduleCode, planId } = session.metadata ?? {};
    if (!tenantId || !moduleCode || !planId) {
      throw new Error(
        `checkout.session.completed ${session.id} (event ${event.id}) fără metadata completă ` +
          '(tenantId/moduleCode/planId) — verifică fluxul de creare a checkout session-ului.',
      );
    }

    const stripeSubscriptionId =
      typeof session.subscription === 'string'
        ? session.subscription
        : session.subscription?.id;
    // Stripe NU garantează livrare ordonată a webhook-urilor — un event
    // vechi (retry întârziat, coadă distribuită) nu trebuie să
    // suprascrie o stare mai nouă (ex: un invoice.payment_failed
    // procesat între timp). Scriem doar dacă evenimentul curent e mai
    // nou decât ultimul aplicat pe acest rând.
    const eventCreatedAt = new Date(event.created * 1000);

    const updated = await tx.tenantModule.updateMany({
      where: {
        tenantId,
        moduleCode,
        // <=, nu < : granularitatea event.created e 1 secundă — două
        // evenimente DISTINCTE pot avea exact același timestamp Stripe.
        // Cu comparație strictă, al doilea ar fi respins silențios ca
        // "stale" deși e legitim (descoperit chiar prin testul e2e de
        // idempotență, care reutilizează același tenant+modul).
        OR: [{ lastEventAt: null }, { lastEventAt: { lte: eventCreatedAt } }],
      },
      data: {
        status: 'active',
        planId,
        stripeSubscriptionId,
        lastEventAt: eventCreatedAt,
      },
    });
    if (updated.count > 0) {
      return;
    }

    // Niciun rând actualizat: fie nu exista încă (primă activare — creăm),
    // fie exista dar era deja mai nou decât evenimentul curent (stale —
    // create-ul de mai jos va eșua pe constrângerea UNIQUE, tratat mai jos).
    try {
      await tx.tenantModule.create({
        data: {
          tenantId,
          moduleCode,
          planId,
          status: 'active',
          stripeSubscriptionId,
          lastEventAt: eventCreatedAt,
        },
      });
    } catch (err) {
      if (this.isUniqueConstraintViolation(err)) {
        this.logger.warn(
          `checkout.session.completed ${event.id} ignorat — există deja o stare mai nouă pentru acest tenant+modul (eveniment stale) sau stripeSubscriptionId e deja folosit.`,
        );
        return;
      }
      throw err;
    }
  }

  private async handleInvoicePaymentFailed(
    tx: Prisma.TransactionClient,
    event: Stripe.Event,
  ): Promise<void> {
    const invoice = event.data.object as Stripe.Invoice;
    // API Stripe recentă: nu mai există invoice.subscription direct —
    // referința e la invoice.parent.subscription_details.subscription.
    const subscription = invoice.parent?.subscription_details?.subscription;
    const subscriptionId =
      typeof subscription === 'string' ? subscription : subscription?.id;
    if (!subscriptionId) {
      this.logger.warn(
        `invoice.payment_failed ${invoice.id} (event ${event.id}) fără subscription — ignorat.`,
      );
      return;
    }

    const eventCreatedAt = new Date(event.created * 1000);
    const updated = await tx.tenantModule.updateMany({
      where: {
        stripeSubscriptionId: subscriptionId,
        // <=, nu < : granularitatea event.created e 1 secundă — două
        // evenimente DISTINCTE pot avea exact același timestamp Stripe.
        // Cu comparație strictă, al doilea ar fi respins silențios ca
        // "stale" deși e legitim (descoperit chiar prin testul e2e de
        // idempotență, care reutilizează același tenant+modul).
        OR: [{ lastEventAt: null }, { lastEventAt: { lte: eventCreatedAt } }],
      },
      data: { status: 'past_due', lastEventAt: eventCreatedAt },
    });
    if (updated.count === 0) {
      this.logger.warn(
        `invoice.payment_failed ${event.id} (subscription ${subscriptionId}) — niciun rând actualizat ` +
          '(subscription necunoscut încă, sau eveniment mai vechi decât ultima stare aplicată).',
      );
    }
  }
}
