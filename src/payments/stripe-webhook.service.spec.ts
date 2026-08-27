import { Prisma } from '@prisma/client';
import type Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';
import { StripeWebhookService } from './stripe-webhook.service';

const NOW_UNIX = Math.floor(Date.now() / 1000);

function makeEvent(
  type: string,
  dataObject: unknown,
  opts: { id?: string; created?: number } = {},
): Stripe.Event {
  return {
    id: opts.id ?? 'evt_test_1',
    type,
    created: opts.created ?? NOW_UNIX,
    data: { object: dataObject },
  } as unknown as Stripe.Event;
}

function uniqueViolation(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '7.10.0',
  });
}

describe('StripeWebhookService', () => {
  let service: StripeWebhookService;
  let tx: {
    processedWebhookEvent: { create: jest.Mock };
    tenantModule: { updateMany: jest.Mock; create: jest.Mock };
  };
  let transaction: jest.Mock;

  beforeEach(() => {
    tx = {
      processedWebhookEvent: { create: jest.fn().mockResolvedValue({}) },
      tenantModule: {
        // Implicit: niciun rând existent — cazul "primă activare".
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn().mockResolvedValue({}),
      },
    };
    transaction = jest.fn((cb: (tx: unknown) => Promise<unknown>) => cb(tx));
    const prisma = { $transaction: transaction } as unknown as PrismaService;
    service = new StripeWebhookService(prisma);
  });

  it('checkout.session.completed, primă activare (niciun rând existent) → creează entitlement activ', async () => {
    const event = makeEvent('checkout.session.completed', {
      id: 'cs_1',
      subscription: 'sub_1',
      metadata: {
        tenantId: 'tenant-1',
        moduleCode: 'invoicing',
        planId: 'plan-1',
      },
    });

    await service.handleEvent(event);

    expect(tx.processedWebhookEvent.create).toHaveBeenCalledWith({
      data: {
        id: 'evt_test_1',
        provider: 'stripe',
        eventType: 'checkout.session.completed',
      },
    });
    expect(tx.tenantModule.updateMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        moduleCode: 'invoicing',
        OR: [
          { lastEventAt: null },
          { lastEventAt: { lte: new Date(event.created * 1000) } },
        ],
      },
      data: {
        status: 'active',
        planId: 'plan-1',
        stripeSubscriptionId: 'sub_1',
        lastEventAt: new Date(event.created * 1000),
      },
    });
    expect(tx.tenantModule.create).toHaveBeenCalledWith({
      data: {
        tenantId: 'tenant-1',
        moduleCode: 'invoicing',
        planId: 'plan-1',
        status: 'active',
        stripeSubscriptionId: 'sub_1',
        lastEventAt: new Date(event.created * 1000),
      },
    });
  });

  it('checkout.session.completed, rând deja activ (updateMany reușește) → NU mai încearcă create', async () => {
    tx.tenantModule.updateMany.mockResolvedValueOnce({ count: 1 });
    const event = makeEvent('checkout.session.completed', {
      id: 'cs_1',
      subscription: 'sub_1',
      metadata: {
        tenantId: 'tenant-1',
        moduleCode: 'invoicing',
        planId: 'plan-1',
      },
    });

    await service.handleEvent(event);

    expect(tx.tenantModule.create).not.toHaveBeenCalled();
  });

  it('checkout.session.completed cu subscription ca obiect (nu string) → extrage id-ul', async () => {
    const event = makeEvent('checkout.session.completed', {
      id: 'cs_1',
      subscription: { id: 'sub_obj_1' },
      metadata: {
        tenantId: 'tenant-1',
        moduleCode: 'invoicing',
        planId: 'plan-1',
      },
    });

    await service.handleEvent(event);

    expect(tx.tenantModule.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          stripeSubscriptionId: 'sub_obj_1',
        }) as unknown,
      }),
    );
  });

  it('checkout.session.completed, eveniment STALE (updateMany 0 + create respinsă UNIQUE) → ignorat, fără eroare', async () => {
    tx.tenantModule.create.mockRejectedValueOnce(uniqueViolation());
    const event = makeEvent('checkout.session.completed', {
      id: 'cs_1',
      metadata: {
        tenantId: 'tenant-1',
        moduleCode: 'invoicing',
        planId: 'plan-1',
      },
    });

    await expect(service.handleEvent(event)).resolves.toBeUndefined();
  });

  it('checkout.session.completed FĂRĂ metadata completă → ARUNCĂ (nu mai marchează silențios "procesat")', async () => {
    const event = makeEvent('checkout.session.completed', {
      id: 'cs_1',
      subscription: 'sub_1',
      metadata: { tenantId: 'tenant-1' }, // lipsesc moduleCode, planId
    });

    await expect(service.handleEvent(event)).rejects.toThrow(
      /fără metadata completă/,
    );
    expect(tx.tenantModule.updateMany).not.toHaveBeenCalled();
    expect(tx.tenantModule.create).not.toHaveBeenCalled();
  });

  it('invoice.payment_failed → trece entitlement-ul pe past_due, cu gardă de ordonare', async () => {
    tx.tenantModule.updateMany.mockResolvedValueOnce({ count: 1 });
    const event = makeEvent('invoice.payment_failed', {
      id: 'in_1',
      parent: { subscription_details: { subscription: 'sub_1' } },
    });

    await service.handleEvent(event);

    expect(tx.tenantModule.updateMany).toHaveBeenCalledWith({
      where: {
        stripeSubscriptionId: 'sub_1',
        OR: [
          { lastEventAt: null },
          { lastEventAt: { lte: new Date(event.created * 1000) } },
        ],
      },
      data: { status: 'past_due', lastEventAt: new Date(event.created * 1000) },
    });
  });

  it('invoice.payment_failed, niciun rând afectat (subscription necunoscut sau eveniment stale) → nu aruncă', async () => {
    tx.tenantModule.updateMany.mockResolvedValueOnce({ count: 0 });
    const event = makeEvent('invoice.payment_failed', {
      id: 'in_1',
      parent: { subscription_details: { subscription: 'sub_necunoscut' } },
    });

    await expect(service.handleEvent(event)).resolves.toBeUndefined();
  });

  it('invoice.payment_failed FĂRĂ subscription → marchează procesat, dar nu modifică nimic', async () => {
    const event = makeEvent('invoice.payment_failed', {
      id: 'in_1',
      parent: null,
    });

    await service.handleEvent(event);

    expect(tx.processedWebhookEvent.create).toHaveBeenCalled();
    expect(tx.tenantModule.updateMany).not.toHaveBeenCalled();
  });

  it('event type necunoscut → marchează procesat, fără efect de business', async () => {
    const event = makeEvent('customer.created', { id: 'cus_1' });

    await service.handleEvent(event);

    expect(tx.processedWebhookEvent.create).toHaveBeenCalled();
    expect(tx.tenantModule.updateMany).not.toHaveBeenCalled();
    expect(tx.tenantModule.create).not.toHaveBeenCalled();
  });

  it('IDEMPOTENȚĂ: event.id deja procesat (conflict UNIQUE) → nu aruncă, nu repetă efectul', async () => {
    transaction.mockRejectedValueOnce(uniqueViolation());
    const event = makeEvent('checkout.session.completed', {
      id: 'cs_1',
      metadata: {
        tenantId: 'tenant-1',
        moduleCode: 'invoicing',
        planId: 'plan-1',
      },
    });

    await expect(service.handleEvent(event)).resolves.toBeUndefined();
  });

  it('propagă alte erori (nu doar conflictul de unicitate) — Stripe trebuie să reîncerce', async () => {
    transaction.mockRejectedValueOnce(new Error('DB indisponibilă'));
    const event = makeEvent('checkout.session.completed', {
      id: 'cs_1',
      metadata: {
        tenantId: 'tenant-1',
        moduleCode: 'invoicing',
        planId: 'plan-1',
      },
    });

    await expect(service.handleEvent(event)).rejects.toThrow(
      'DB indisponibilă',
    );
  });
});
