import type { PrismaService } from '../prisma/prisma.service';
import { RbacService } from './rbac.service';

describe('RbacService', () => {
  const tenantId = 'tenant-1';
  const userId = 'user-1';
  let prisma: {
    user: { findFirst: jest.Mock };
    userModuleRole: { count: jest.Mock };
  };
  let service: RbacService;

  beforeEach(() => {
    prisma = {
      user: { findFirst: jest.fn() },
      userModuleRole: { count: jest.fn() },
    };
    service = new RbacService(prisma as unknown as PrismaService);
  });

  describe('getGlobalRole', () => {
    it('întoarce null pentru un user inactiv (chiar dacă are rol)', async () => {
      prisma.user.findFirst.mockResolvedValue({
        role: 'owner',
        isActive: false,
      });
      await expect(service.getGlobalRole(tenantId, userId)).resolves.toBeNull();
    });

    it('întoarce rolul pentru un user activ', async () => {
      prisma.user.findFirst.mockResolvedValue({
        role: 'admin',
        isActive: true,
      });
      await expect(service.getGlobalRole(tenantId, userId)).resolves.toBe(
        'admin',
      );
    });
  });

  describe('hasAnyModuleRole', () => {
    it('filtrează pe user.isActive:true — fix system-orchestrator (audit holistic)', async () => {
      // Un user dezactivat NU trebuie să mai treacă, indiferent ce rânduri
      // are în user_module_roles — altfel accesul rămâne valid până la
      // expirarea JWT-ului deja emis, contrazicând garanția „citire live".
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
          user: { isActive: true },
        },
      });
    });

    it('întoarce true dacă userul activ are cel puțin unul din roluri', async () => {
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
