import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from './jwt-auth.guard';
import type { RequestWithUser } from './jwt-payload.interface';

function makeContext(authorization?: string): {
  context: ExecutionContext;
  request: {
    headers: Record<string, string | undefined>;
  } & Partial<RequestWithUser>;
} {
  const request: {
    headers: Record<string, string | undefined>;
  } & Partial<RequestWithUser> = {
    headers: { authorization },
  };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => (() => undefined) as unknown,
    getClass: () => class {},
  } as unknown as ExecutionContext;
  return { context, request };
}

// Reflector mockuit (nu real) — testele de mai jos verifică logica JWT, nu
// mecanismul de reflecție al metadatelor Nest. `isPublic`/`allowPreTenant`
// pot fi setate independent — JwtAuthGuard citește ambele metadate cu
// chei diferite (IS_PUBLIC_KEY, ALLOW_PRE_TENANT_KEY).
function makeReflector(isPublic: boolean, allowPreTenant = false): Reflector {
  return {
    getAllAndOverride: jest
      .fn()
      .mockReturnValueOnce(isPublic)
      .mockReturnValue(allowPreTenant),
  } as unknown as Reflector;
}

describe('JwtAuthGuard', () => {
  it('permite accesul necondiționat pe o rută @Public()', async () => {
    const verifyAsync = jest.fn();
    const jwt = { verifyAsync } as unknown as JwtService;
    const guard = new JwtAuthGuard(jwt, makeReflector(true));
    const { context } = makeContext(undefined); // fără token, deliberat

    const allowed = await guard.canActivate(context);

    expect(allowed).toBe(true);
    expect(verifyAsync).not.toHaveBeenCalled();
  });

  it('respinge cererea fără header Authorization pe o rută protejată', async () => {
    const jwt = { verifyAsync: jest.fn() } as unknown as JwtService;
    const guard = new JwtAuthGuard(jwt, makeReflector(false));
    const { context } = makeContext(undefined);

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('respinge un header care nu e schema Bearer', async () => {
    const jwt = { verifyAsync: jest.fn() } as unknown as JwtService;
    const guard = new JwtAuthGuard(jwt, makeReflector(false));
    const { context } = makeContext('Basic abc123');

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('respinge un token invalid/expirat', async () => {
    const jwt = {
      verifyAsync: jest.fn().mockRejectedValue(new Error('jwt expired')),
    } as unknown as JwtService;
    const guard = new JwtAuthGuard(jwt, makeReflector(false));
    const { context } = makeContext('Bearer token-invalid');

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('atașează request.user și permite accesul la token valid (cu tenantId)', async () => {
    const jwt = {
      verifyAsync: jest
        .fn()
        .mockResolvedValue({ sub: 'user-1', tenantId: 'tenant-1' }),
    } as unknown as JwtService;
    const guard = new JwtAuthGuard(jwt, makeReflector(false));
    const { context, request } = makeContext('Bearer token-valid');

    const allowed = await guard.canActivate(context);

    expect(allowed).toBe(true);
    expect(request.user).toEqual({ userId: 'user-1', tenantId: 'tenant-1' });
  });

  it('respinge un token PRE-TENANT (fără tenantId) pe o rută fără @AllowPreTenant()', async () => {
    const jwt = {
      verifyAsync: jest.fn().mockResolvedValue({ sub: 'user-1' }),
    } as unknown as JwtService;
    const guard = new JwtAuthGuard(jwt, makeReflector(false, false));
    const { context } = makeContext('Bearer token-pre-tenant');

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('acceptă un token PRE-TENANT (fără tenantId) pe o rută @AllowPreTenant()', async () => {
    const jwt = {
      verifyAsync: jest.fn().mockResolvedValue({ sub: 'user-1' }),
    } as unknown as JwtService;
    const guard = new JwtAuthGuard(jwt, makeReflector(false, true));
    const { context, request } = makeContext('Bearer token-pre-tenant');

    const allowed = await guard.canActivate(context);

    expect(allowed).toBe(true);
    expect(request.user).toEqual({ userId: 'user-1' }); // fără tenantId
  });
});
