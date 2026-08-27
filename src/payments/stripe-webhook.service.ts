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
        await this.handleInvoiceStatusEvent(tx, event, 'past_due');
        break;
      case 'invoice.payment_succeeded':
        // Recuperare din past_due (ex: client își actualizează cardul,
        // Stripe reîncearcă automat cu succes) — fără acest handler,
        // singura cale de revenire la 'active' ar fi intervenție manuală
        // în DB, deși clientul a plătit efectiv. Găsit de logic-reviewer
        // la un audit holistic, nu era literă în docs/data-model.md.
        await this.handleInvoiceStatusEvent(tx, event, 'active');
        break;
      case 'customer.subscription.deleted':
        // Anulare explicită — 'canceled' e parte din fluxul deja documentat
        // în docs/data-model.md, dar nimic nu-l scria până acum.
        await this.handleSubscriptionDeleted(tx, event);
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
    const eventCreatedAt = this.eventCreatedAt(event);

    const updated = await tx.tenantModule.updateMany({
      where: {
        tenantId,
        moduleCode,
        ...this.notStaleFilter(eventCreatedAt),
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

  /**
   * Tipar comun pentru evenimentele de facturare care doar schimbă statusul
   * unui entitlement deja existent, identificat prin stripeSubscriptionId
   * (invoice.payment_failed -> past_due, invoice.payment_succeeded ->
   * active) — nu creează rânduri noi, spre deosebire de
   * checkout.session.completed, singurul eveniment cu metadata
   * tenant/modul/plan necesară pentru o primă activare.
   */
  private async handleInvoiceStatusEvent(
    tx: Prisma.TransactionClient,
    event: Stripe.Event,
    status: 'active' | 'past_due',
  ): Promise<void> {
    const invoice = event.data.object as Stripe.Invoice;
    // API Stripe recentă: nu mai există invoice.subscription direct —
    // referința e la invoice.parent.subscription_details.subscription.
    const subscription = invoice.parent?.subscription_details?.subscription;
    const subscriptionId =
      typeof subscription === 'string' ? subscription : subscription?.id;
    if (!subscriptionId) {
      this.logger.warn(
        `${event.type} ${invoice.id} (event ${event.id}) fără subscription — ignorat.`,
      );
      return;
    }
    await this.updateStatusBySubscription(tx, event, subscriptionId, status);
  }

  private async handleSubscriptionDeleted(
    tx: Prisma.TransactionClient,
    event: Stripe.Event,
  ): Promise<void> {
    const subscription = event.data.object as Stripe.Subscription;
    await this.updateStatusBySubscription(
      tx,
      event,
      subscription.id,
      'canceled',
    );
  }

  private async updateStatusBySubscription(
    tx: Prisma.TransactionClient,
    event: Stripe.Event,
    subscriptionId: string,
    status: 'active' | 'past_due' | 'canceled',
  ): Promise<void> {
    const eventCreatedAt = this.eventCreatedAt(event);
    const updated = await tx.tenantModule.updateMany({
      where: {
        stripeSubscriptionId: subscriptionId,
        ...this.notStaleFilter(eventCreatedAt),
      },
      data: { status, lastEventAt: eventCreatedAt },
    });
    if (updated.count === 0) {
      this.logger.warn(
        `${event.type} ${event.id} (subscription ${subscriptionId}) — niciun rând actualizat ` +
          '(subscription necunoscut încă, sau eveniment mai vechi decât ultima stare aplicată).',
      );
    }
  }

  private eventCreatedAt(event: Stripe.Event): Date {
    return new Date(event.created * 1000);
  }

  /**
   * Stripe NU garantează livrare ordonată a webhook-urilor — un eveniment
   * vechi nu trebuie să suprascrie o stare mai nouă. `<=`, nu `<`:
   * granularitatea event.created e 1 secundă — două evenimente DISTINCTE
   * pot avea exact același timestamp (descoperit printr-un test e2e
   * propriu, nu doar teoretic). Vezi docs/data-model.md pentru riscul
   * rezidual acceptat pe evenimente cu timestamp identic.
   */
  private notStaleFilter(eventCreatedAt: Date): Prisma.TenantModuleWhereInput {
    return {
      OR: [{ lastEventAt: null }, { lastEventAt: { lte: eventCreatedAt } }],
    };
  }
}
