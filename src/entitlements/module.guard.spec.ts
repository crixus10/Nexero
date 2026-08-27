import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TenantModule } from '@prisma/client';
import { ModuleGuard, RequestWithEntitlement } from './module.guard';
import { EntitlementsService } from './entitlements.service';

function makeContext(user?: { userId: string; tenantId: string }): {
  context: ExecutionContext;
  request: Partial<RequestWithEntitlement>;
} {
  const request: Partial<RequestWithEntitlement> = { user };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => (() => undefined) as unknown,
  } as unknown as ExecutionContext;
  return { context, request };
}

function makeReflector(moduleCode: string | undefined): Reflector {
  return { get: jest.fn().mockReturnValue(moduleCode) } as unknown as Reflector;
}

const entitlement: TenantModule = {
  id: 'ent-1',
  tenantId: 'tenant-1',
  moduleCode: 'test',
  planId: 'plan-1',
  status: 'active',
  trialEndsAt: null,
  currentPeriodEnd: null,
  stripeSubscriptionId: null,
};

describe('ModuleGuard', () => {
  it('permite accesul necondiționat pe o rută fără @RequireModule', async () => {
    const getActive = jest.fn();
    const guard = new ModuleGuard(makeReflector(undefined), {
      getActive,
    } as unknown as EntitlementsService);
    const { context } = makeContext(undefined);

    const allowed = await guard.canActivate(context);

    expect(allowed).toBe(true);
    expect(getActive).not.toHaveBeenCalled();
  });

  it('respinge cu 401 dacă request.user lipsește (JwtAuthGuard nu a rulat)', async () => {
    const guard = new ModuleGuard(makeReflector('test'), {
      getActive: jest.fn(),
    } as unknown as EntitlementsService);
    const { context } = makeContext(undefined);

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('respinge cu 403 dacă firma nu are entitlement activ', async () => {
    const getActive = jest.fn().mockResolvedValue(null);
    const guard = new ModuleGuard(makeReflector('test'), {
      getActive,
    } as unknown as EntitlementsService);
    const { context } = makeContext({ userId: 'user-1', tenantId: 'tenant-1' });

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
    expect(getActive).toHaveBeenCalledWith('tenant-1', 'test');
  });

  it('permite accesul și atașează request.entitlement dacă firma are entitlement activ', async () => {
    const getActive = jest.fn().mockResolvedValue(entitlement);
    const guard = new ModuleGuard(makeReflector('test'), {
      getActive,
    } as unknown as EntitlementsService);
    const { context, request } = makeContext({
      userId: 'user-1',
      tenantId: 'tenant-1',
    });

    const allowed = await guard.canActivate(context);

    expect(allowed).toBe(true);
    expect(request.entitlement).toEqual(entitlement);
  });
});
