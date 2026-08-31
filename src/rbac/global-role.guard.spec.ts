import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { GlobalRoleGuard } from './global-role.guard';
import type { RbacService } from './rbac.service';

function makeContext(user?: { tenantId: string; userId: string }) {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

describe('GlobalRoleGuard', () => {
  let reflector: { get: jest.Mock };
  let rbac: { getGlobalRole: jest.Mock };
  let guard: GlobalRoleGuard;

  beforeEach(() => {
    reflector = { get: jest.fn() };
    rbac = { getGlobalRole: jest.fn() };
    guard = new GlobalRoleGuard(
      reflector as unknown as Reflector,
      rbac as unknown as RbacService,
    );
  });

  it('lasă cererea să treacă dacă ruta nu are @RequireGlobalRole', async () => {
    reflector.get.mockReturnValue(undefined);
    await expect(guard.canActivate(makeContext())).resolves.toBe(true);
    expect(rbac.getGlobalRole).not.toHaveBeenCalled();
  });

  it('aruncă UnauthorizedException dacă request.user lipsește (plasă defensivă)', async () => {
    reflector.get.mockReturnValue(['owner']);
    await expect(guard.canActivate(makeContext(undefined))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('aruncă ForbiddenException dacă rolul userului nu e în lista permisă', async () => {
    reflector.get.mockReturnValue(['owner', 'admin']);
    rbac.getGlobalRole.mockResolvedValue('operator');
    await expect(
      guard.canActivate(makeContext({ tenantId: 't1', userId: 'u1' })),
    ).rejects.toThrow(ForbiddenException);
  });

  it('aruncă ForbiddenException dacă userul e inactiv (getGlobalRole întoarce null)', async () => {
    reflector.get.mockReturnValue(['owner', 'admin']);
    rbac.getGlobalRole.mockResolvedValue(null);
    await expect(
      guard.canActivate(makeContext({ tenantId: 't1', userId: 'u1' })),
    ).rejects.toThrow(ForbiddenException);
  });

  it('lasă cererea să treacă dacă rolul userului e în lista permisă', async () => {
    reflector.get.mockReturnValue(['owner', 'admin']);
    rbac.getGlobalRole.mockResolvedValue('admin');
    await expect(
      guard.canActivate(makeContext({ tenantId: 't1', userId: 'u1' })),
    ).resolves.toBe(true);
  });
});
