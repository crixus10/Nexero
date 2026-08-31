import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { ModuleRoleGuard } from './module-role.guard';
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

describe('ModuleRoleGuard', () => {
  let reflector: { get: jest.Mock };
  let rbac: { hasAnyModuleRole: jest.Mock };
  let guard: ModuleRoleGuard;

  beforeEach(() => {
    reflector = { get: jest.fn() };
    rbac = { hasAnyModuleRole: jest.fn() };
    guard = new ModuleRoleGuard(
      reflector as unknown as Reflector,
      rbac as unknown as RbacService,
    );
  });

  it('lasă cererea să treacă dacă ruta nu are @RequireModuleRole', async () => {
    reflector.get.mockReturnValue(undefined);
    await expect(guard.canActivate(makeContext())).resolves.toBe(true);
    expect(rbac.hasAnyModuleRole).not.toHaveBeenCalled();
  });

  it('aruncă UnauthorizedException dacă request.user lipsește (plasă defensivă)', async () => {
    reflector.get.mockReturnValue(['invoicing:issuer']);
    await expect(guard.canActivate(makeContext(undefined))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('aruncă ForbiddenException dacă userul nu are niciunul din rolurile permise', async () => {
    reflector.get.mockReturnValue(['invoicing:issuer', 'invoicing:admin']);
    rbac.hasAnyModuleRole.mockResolvedValue(false);
    await expect(
      guard.canActivate(makeContext({ tenantId: 't1', userId: 'u1' })),
    ).rejects.toThrow(ForbiddenException);
  });

  it('lasă cererea să treacă dacă userul are cel puțin unul din rolurile permise', async () => {
    reflector.get.mockReturnValue(['invoicing:issuer', 'invoicing:admin']);
    rbac.hasAnyModuleRole.mockResolvedValue(true);
    await expect(
      guard.canActivate(makeContext({ tenantId: 't1', userId: 'u1' })),
    ).resolves.toBe(true);
    expect(rbac.hasAnyModuleRole).toHaveBeenCalledWith('t1', 'u1', [
      'invoicing:issuer',
      'invoicing:admin',
    ]);
  });
});
