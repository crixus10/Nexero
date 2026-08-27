import { Test, TestingModule } from '@nestjs/testing';
import { TenantModule } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EntitlementsService } from './entitlements.service';

describe('EntitlementsService', () => {
  let service: EntitlementsService;
  let findUnique: jest.Mock;

  const baseEntitlement: TenantModule = {
    id: 'ent-1',
    tenantId: 'tenant-1',
    moduleCode: 'test',
    planId: 'plan-1',
    status: 'active',
    trialEndsAt: null,
    currentPeriodEnd: null,
    stripeSubscriptionId: null,
    lastEventAt: null,
  };

  beforeEach(async () => {
    findUnique = jest.fn();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EntitlementsService,
        { provide: PrismaService, useValue: { tenantModule: { findUnique } } },
      ],
    }).compile();

    service = module.get(EntitlementsService);
  });

  it('întoarce null dacă nu există entitlement', async () => {
    findUnique.mockResolvedValue(null);

    const result = await service.getActive('tenant-1', 'test');

    expect(result).toBeNull();
    expect(findUnique).toHaveBeenCalledWith({
      where: {
        tenantId_moduleCode: { tenantId: 'tenant-1', moduleCode: 'test' },
      },
    });
  });

  it('întoarce entitlement-ul dacă status = active', async () => {
    findUnique.mockResolvedValue(baseEntitlement);

    const result = await service.getActive('tenant-1', 'test');

    expect(result).toEqual(baseEntitlement);
  });

  it('întoarce entitlement-ul dacă status = trial și trialEndsAt e în viitor', async () => {
    findUnique.mockResolvedValue({
      ...baseEntitlement,
      status: 'trial',
      trialEndsAt: new Date(Date.now() + 86_400_000),
    });

    const result = await service.getActive('tenant-1', 'test');

    expect(result).not.toBeNull();
  });

  it('întoarce entitlement-ul dacă status = trial și trialEndsAt nu e setat', async () => {
    findUnique.mockResolvedValue({
      ...baseEntitlement,
      status: 'trial',
      trialEndsAt: null,
    });

    const result = await service.getActive('tenant-1', 'test');

    expect(result).not.toBeNull();
  });

  it('întoarce null dacă status = trial dar trialEndsAt e în trecut (expirat)', async () => {
    findUnique.mockResolvedValue({
      ...baseEntitlement,
      status: 'trial',
      trialEndsAt: new Date(Date.now() - 86_400_000),
    });

    const result = await service.getActive('tenant-1', 'test');

    expect(result).toBeNull();
  });

  it('întoarce null dacă status = past_due', async () => {
    findUnique.mockResolvedValue({ ...baseEntitlement, status: 'past_due' });

    const result = await service.getActive('tenant-1', 'test');

    expect(result).toBeNull();
  });

  it('întoarce null dacă status = canceled', async () => {
    findUnique.mockResolvedValue({ ...baseEntitlement, status: 'canceled' });

    const result = await service.getActive('tenant-1', 'test');

    expect(result).toBeNull();
  });
});
