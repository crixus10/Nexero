import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard, RequestWithUser } from './jwt-auth.guard';

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
  } as unknown as ExecutionContext;
  return { context, request };
}

describe('JwtAuthGuard', () => {
  it('respinge cererea fără header Authorization', async () => {
    const jwt = { verifyAsync: jest.fn() } as unknown as JwtService;
    const guard = new JwtAuthGuard(jwt);
    const { context } = makeContext(undefined);

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('respinge un header care nu e schema Bearer', async () => {
    const jwt = { verifyAsync: jest.fn() } as unknown as JwtService;
    const guard = new JwtAuthGuard(jwt);
    const { context } = makeContext('Basic abc123');

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('respinge un token invalid/expirat', async () => {
    const jwt = {
      verifyAsync: jest.fn().mockRejectedValue(new Error('jwt expired')),
    } as unknown as JwtService;
    const guard = new JwtAuthGuard(jwt);
    const { context } = makeContext('Bearer token-invalid');

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('atașează request.user și permite accesul la token valid', async () => {
    const jwt = {
      verifyAsync: jest
        .fn()
        .mockResolvedValue({ sub: 'user-1', tenantId: 'tenant-1' }),
    } as unknown as JwtService;
    const guard = new JwtAuthGuard(jwt);
    const { context, request } = makeContext('Bearer token-valid');

    const allowed = await guard.canActivate(context);

    expect(allowed).toBe(true);
    expect(request.user).toEqual({ userId: 'user-1', tenantId: 'tenant-1' });
  });
});
