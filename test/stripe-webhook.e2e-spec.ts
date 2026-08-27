import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import Stripe from 'stripe';
import { AppModule } from '../src/app.module';

// Verifică lanțul complet, cu un payload SEMNAT REAL (generateTestHeaderString
// — helper-ul oficial Stripe pentru teste), inclusiv idempotența cerută
// explicit: același event.id trimis de 2 ori nu activează de 2 ori.
const TENANT_CUI = 'RO-E2E-STRIPE-WEBHOOK';
// Cod de test dedicat, NU 'invoicing' — acela e acum modulul real din
// catalog (prisma/seed.ts), cu propriul plan permanent; cleanup-ul de mai
// jos (deleteMany pe modules) ar da FK violation dacă am refolosi codul.
const MODULE_CODE = 'e2e-stripe-webhook-test';
const PLAN_ID = '00000000-0000-0000-0000-000000000099';

describe('Stripe webhook (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let webhookSecret: string;
  let tenantId: string;

  beforeAll(async () => {
    const connectionString = process.env.DATABASE_URL;
    webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? '';
    if (!connectionString || !webhookSecret) {
      throw new Error(
        'DATABASE_URL / STRIPE_WEBHOOK_SECRET nu sunt setate pentru testele e2e.',
      );
    }
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

    const tenant = await prisma.tenant.upsert({
      where: { cui: TENANT_CUI },
      update: {},
      create: { name: 'E2E Stripe Webhook Tenant', cui: TENANT_CUI },
    });
    tenantId = tenant.id;
    await prisma.module.upsert({
      where: { code: MODULE_CODE },
      update: {},
      create: {
        code: MODULE_CODE,
        name: 'E2E Stripe Webhook Test Module',
        billingType: 'flat',
      },
    });
    await prisma.plan.upsert({
      where: { id: PLAN_ID },
      update: {},
      create: {
        id: PLAN_ID,
        moduleCode: MODULE_CODE,
        name: 'e2e-plan',
        priceCents: 0,
      },
    });
    // Curăț orice rest dintr-o rulare anterioară eșuată, ca testele să
    // pornească de la starea "neactivat".
    await prisma.tenantModule.deleteMany({
      where: { tenantId, moduleCode: MODULE_CODE },
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication({ rawBody: true });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await prisma.tenantModule.deleteMany({
      where: { tenantId, moduleCode: MODULE_CODE },
    });
    await prisma.processedWebhookEvent.deleteMany({
      where: { id: { startsWith: 'evt_e2e_test_' } },
    });
    await prisma.plan.deleteMany({ where: { id: PLAN_ID } });
    await prisma.module.deleteMany({ where: { code: MODULE_CODE } });
    await prisma.tenant.deleteMany({ where: { cui: TENANT_CUI } });
    await prisma.$disconnect();
    await app.close();
  });

  function signedPayload(
    eventId: string,
    subscriptionId: string,
    opts: { created?: number; metadata?: Record<string, string> } = {},
  ): { payload: string; header: string } {
    const payload = JSON.stringify({
      id: eventId,
      object: 'event',
      type: 'checkout.session.completed',
      created: opts.created ?? Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: 'cs_e2e_test',
          object: 'checkout.session',
          subscription: subscriptionId,
          metadata: opts.metadata ?? {
            tenantId,
            moduleCode: MODULE_CODE,
            planId: PLAN_ID,
          },
        },
      },
    });
    // Helper oficial Stripe pentru semnarea payload-urilor de test — nu o
    // reimplementare proprie a HMAC-ului lor.
    const header = new Stripe(
      'sk_test_placeholder',
    ).webhooks.generateTestHeaderString({
      payload,
      secret: webhookSecret,
    });
    return { payload, header };
  }

  function sign(payload: string): string {
    return new Stripe('sk_test_placeholder').webhooks.generateTestHeaderString({
      payload,
      secret: webhookSecret,
    });
  }

  function invoiceEventPayload(
    type: 'invoice.payment_failed' | 'invoice.payment_succeeded',
    eventId: string,
    subscriptionId: string,
    created?: number,
  ): { payload: string; header: string } {
    const payload = JSON.stringify({
      id: eventId,
      object: 'event',
      type,
      created: created ?? Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: 'in_e2e_test',
          object: 'invoice',
          parent: { subscription_details: { subscription: subscriptionId } },
        },
      },
    });
    return { payload, header: sign(payload) };
  }

  function subscriptionDeletedPayload(
    eventId: string,
    subscriptionId: string,
    created?: number,
  ): { payload: string; header: string } {
    const payload = JSON.stringify({
      id: eventId,
      object: 'event',
      type: 'customer.subscription.deleted',
      created: created ?? Math.floor(Date.now() / 1000),
      data: { object: { id: subscriptionId, object: 'subscription' } },
    });
    return { payload, header: sign(payload) };
  }

  it('fără semnătură → 400 (nu procesează nimic)', async () => {
    await request(app.getHttpServer())
      .post('/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .send({ id: 'evt_fake', type: 'checkout.session.completed' })
      .expect(400);
  });

  it('semnătură invalidă → 400', async () => {
    const { payload } = signedPayload('evt_e2e_test_invalid_sig', 'sub_x');
    await request(app.getHttpServer())
      .post('/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .set('Stripe-Signature', 't=1,v1=semnatura-falsa')
      .send(payload)
      .expect(400);
  });

  it('eveniment valid, semnat corect → 200 și activează entitlement-ul', async () => {
    const eventId = 'evt_e2e_test_activate';
    const { payload, header } = signedPayload(eventId, 'sub_e2e_test');

    await request(app.getHttpServer())
      .post('/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .set('Stripe-Signature', header)
      .send(payload)
      .expect(200)
      .expect({ received: true });

    const entitlement = await prisma.tenantModule.findUnique({
      where: { tenantId_moduleCode: { tenantId, moduleCode: MODULE_CODE } },
    });
    expect(entitlement?.status).toBe('active');
    expect(entitlement?.stripeSubscriptionId).toBe('sub_e2e_test');
  });

  it('IDEMPOTENȚĂ: același event.id retrimis → 200, dar NU reprocesează (rămâne pe valorile primei trimiteri)', async () => {
    const eventId = 'evt_e2e_test_idempotent';
    const first = signedPayload(eventId, 'sub_first');
    const replay = signedPayload(eventId, 'sub_replay_should_be_ignored');

    await request(app.getHttpServer())
      .post('/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .set('Stripe-Signature', first.header)
      .send(first.payload)
      .expect(200);

    await request(app.getHttpServer())
      .post('/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .set('Stripe-Signature', replay.header)
      .send(replay.payload)
      .expect(200);

    const entitlement = await prisma.tenantModule.findUnique({
      where: { tenantId_moduleCode: { tenantId, moduleCode: MODULE_CODE } },
    });
    // Dacă evenimentul ar fi fost reprocesat, subscriptionId ar fi
    // "sub_replay_should_be_ignored" — proba directă a idempotenței.
    expect(entitlement?.stripeSubscriptionId).toBe('sub_first');

    const processedCount = await prisma.processedWebhookEvent.count({
      where: { id: eventId },
    });
    expect(processedCount).toBe(1);
  });

  it('metadata incompletă → 500 (nu 200!), ȘI evenimentul NU rămâne marcat "procesat" (rollback real)', async () => {
    const eventId = 'evt_e2e_test_bad_metadata';
    const { payload, header } = signedPayload(eventId, 'sub_bad', {
      metadata: { tenantId }, // lipsesc moduleCode, planId — client ar fi fost debitat real
    });

    await request(app.getHttpServer())
      .post('/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .set('Stripe-Signature', header)
      .send(payload)
      .expect(500);

    // Proba directă a fix-ului pentru blocantul semnalat de logic-reviewer:
    // dacă tranzacția n-ar face rollback, acest eveniment ar rămâne marcat
    // "procesat" definitiv, fără activare și fără nicio șansă de retry util.
    const processedCount = await prisma.processedWebhookEvent.count({
      where: { id: eventId },
    });
    expect(processedCount).toBe(0);
  });

  it('GARDĂ DE ORDONARE: un eveniment mai VECHI, sosit după unul mai nou, nu suprascrie starea', async () => {
    const newerEventId = 'evt_e2e_test_order_newer';
    const olderEventId = 'evt_e2e_test_order_older';
    const now = Math.floor(Date.now() / 1000);

    // Simulăm sosirea INVERSATĂ: cel "nou" (după ceas) ajunge primul.
    const newer = signedPayload(newerEventId, 'sub_newer', { created: now });
    const older = signedPayload(olderEventId, 'sub_older_should_be_ignored', {
      created: now - 3600,
    });

    await request(app.getHttpServer())
      .post('/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .set('Stripe-Signature', newer.header)
      .send(newer.payload)
      .expect(200);

    await request(app.getHttpServer())
      .post('/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .set('Stripe-Signature', older.header)
      .send(older.payload)
      .expect(200); // Stripe tot primește 200 — evenimentul "vechi" e valid, doar ignorat ca stale.

    const entitlement = await prisma.tenantModule.findUnique({
      where: { tenantId_moduleCode: { tenantId, moduleCode: MODULE_CODE } },
    });
    // Dacă garda de ordonare n-ar exista, "ultima scriere câștigă" ar pune
    // sub_older_should_be_ignored, deși evenimentul lui e cronologic mai vechi.
    expect(entitlement?.stripeSubscriptionId).toBe('sub_newer');
  });

  it('CICLU COMPLET: activare -> plată eșuată (past_due) -> plată reușită -> revine pe active', async () => {
    const subscriptionId = 'sub_lifecycle_test';
    const activate = signedPayload(
      'evt_e2e_test_lifecycle_activate',
      subscriptionId,
    );
    await request(app.getHttpServer())
      .post('/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .set('Stripe-Signature', activate.header)
      .send(activate.payload)
      .expect(200);

    const failed = invoiceEventPayload(
      'invoice.payment_failed',
      'evt_e2e_test_lifecycle_failed',
      subscriptionId,
    );
    await request(app.getHttpServer())
      .post('/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .set('Stripe-Signature', failed.header)
      .send(failed.payload)
      .expect(200);

    let entitlement = await prisma.tenantModule.findUnique({
      where: { tenantId_moduleCode: { tenantId, moduleCode: MODULE_CODE } },
    });
    expect(entitlement?.status).toBe('past_due');

    // Găsit de logic-reviewer la un audit holistic: fără acest eveniment,
    // un client care plătește efectiv rămâne blocat până la intervenție
    // manuală în DB.
    const succeeded = invoiceEventPayload(
      'invoice.payment_succeeded',
      'evt_e2e_test_lifecycle_succeeded',
      subscriptionId,
    );
    await request(app.getHttpServer())
      .post('/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .set('Stripe-Signature', succeeded.header)
      .send(succeeded.payload)
      .expect(200);

    entitlement = await prisma.tenantModule.findUnique({
      where: { tenantId_moduleCode: { tenantId, moduleCode: MODULE_CODE } },
    });
    expect(entitlement?.status).toBe('active');
  });

  it('customer.subscription.deleted → trece entitlement-ul pe canceled', async () => {
    const subscriptionId = 'sub_cancel_test';
    const activate = signedPayload(
      'evt_e2e_test_cancel_activate',
      subscriptionId,
    );
    await request(app.getHttpServer())
      .post('/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .set('Stripe-Signature', activate.header)
      .send(activate.payload)
      .expect(200);

    const deleted = subscriptionDeletedPayload(
      'evt_e2e_test_cancel_deleted',
      subscriptionId,
    );
    await request(app.getHttpServer())
      .post('/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .set('Stripe-Signature', deleted.header)
      .send(deleted.payload)
      .expect(200);

    const entitlement = await prisma.tenantModule.findUnique({
      where: { tenantId_moduleCode: { tenantId, moduleCode: MODULE_CODE } },
    });
    expect(entitlement?.status).toBe('canceled');
  });
});
