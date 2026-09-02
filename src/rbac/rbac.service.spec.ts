import type { PrismaService } from '../prisma/prisma.service';
import { RbacService } from './rbac.service';

describe('RbacService', () => {
  const tenantId = 'tenant-1';
  const userId = 'user-1';
  let prisma: {
    userTenantAccess: { findFirst: jest.Mock };
    userModuleRole: { count: jest.Mock };
  };
  let service: RbacService;

  beforeEach(() => {
    prisma = {
      userTenantAccess: { findFirst: jest.fn() },
      userModuleRole: { count: jest.fn() },
    };
    service = new RbacService(prisma as unknown as PrismaService);
  });

  describe('getGlobalRole', () => {
    it('întoarce null dacă userul n-are un rând ACTIV de acces la firmă (user inactiv global sau acces revocat)', async () => {
      prisma.userTenantAccess.findFirst.mockResolvedValue(null);
      await expect(service.getGlobalRole(tenantId, userId)).resolves.toBeNull();
      expect(prisma.userTenantAccess.findFirst).toHaveBeenCalledWith({
        where: {
          userId,
          tenantId,
          isActive: true,
          user: { isActive: true },
        },
        select: { role: true },
      });
    });

    it('întoarce rolul pentru un user cu acces activ la firmă', async () => {
      prisma.userTenantAccess.findFirst.mockResolvedValue({ role: 'admin' });
      await expect(service.getGlobalRole(tenantId, userId)).resolves.toBe(
        'admin',
      );
    });
  });

  describe('hasAnyModuleRole', () => {
    it('filtrează pe user.isActive:true ȘI acces activ la firma curentă — fix system-orchestrator/rbac-guardian', async () => {
      // Un user dezactivat global, sau cu accesul la ACEASTĂ firmă revocat,
      // NU trebuie să mai treacă, indiferent ce rânduri orfane are în
      // user_module_roles — altfel accesul rămâne valid până la expirarea
      // JWT-ului deja emis, contrazicând garanția „citire live".
      prisma.userModuleRole.count.mockResolvedValue(0);

      const result = await service.hasAnyModuleRole(tenantId, userId, [
        'invoicing:issuer',
      ]);

      expect(result).toBe(false);
      expect(prisma.userModuleRole.count).toHaveBeenCalledWith({
        where: {
          tenantId,
          userId,
          role: { in: ['invoicing:issuer'] },
          user: {
            isActive: true,
            tenantAccess: { some: { tenantId, isActive: true } },
          },
        },
      });
    });

    it('întoarce true dacă userul activ, cu acces la firmă, are cel puțin unul din roluri', async () => {
      prisma.userModuleRole.count.mockResolvedValue(1);
      await expect(
        service.hasAnyModuleRole(tenantId, userId, [
          'invoicing:issuer',
          'invoicing:admin',
        ]),
      ).resolves.toBe(true);
    });

    it('întoarce true fără interogare dacă lista de roluri e goală', async () => {
      await expect(
        service.hasAnyModuleRole(tenantId, userId, []),
      ).resolves.toBe(true);
      expect(prisma.userModuleRole.count).not.toHaveBeenCalled();
    });
  });
});
