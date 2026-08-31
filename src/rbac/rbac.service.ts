import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Sursa de adevăr pentru cele două niveluri de rol — vezi
 * docs/data-model.md, secțiunea „RBAC — users.role (global) + user_module_roles (per-modul)". Citire live
 * din DB la fiecare verificare (nu din JWT), la fel ca EntitlementsService
 * pentru module: dacă un owner retrogradează pe cineva sau îi revocă un
 * rol de modul, efectul e imediat, nu așteaptă expirarea unui token deja
 * emis.
 */
@Injectable()
export class RbacService {
  constructor(private readonly prisma: PrismaService) {}

  /** Rolul GLOBAL (companie) al userului — 'owner' | 'admin' | 'accountant' | 'operator'. */
  async getGlobalRole(
    tenantId: string,
    userId: string,
  ): Promise<string | null> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, tenantId },
      select: { role: true, isActive: true },
    });
    if (!user || !user.isActive) {
      return null;
    }
    return user.role;
  }

  /**
   * Adevărat dacă userul are CEL PUȚIN unul dintre rolurile per-modul date
   * (ex. `['invoicing:issuer', 'invoicing:admin']`) — folosit pentru
   * verificări „oricare din" (un issuer sau un admin pot ambii emite).
   *
   * `user: { isActive: true }` — fix system-orchestrator (audit holistic):
   * fără acest filtru, un user dezactivat (`UsersService.update`,
   * `isActive: false`) își păstra accesul pe orice rută protejată DOAR cu
   * `@RequireModuleRole` (fără `@RequireGlobalRole`) până la expirarea
   * JWT-ului deja emis — până la 1h (`JWT_EXPIRES_IN`), contrazicând direct
   * garanția „citire live, efect imediat" documentată mai sus și în
   * docs/data-model.md.
   */
  async hasAnyModuleRole(
    tenantId: string,
    userId: string,
    roles: readonly string[],
  ): Promise<boolean> {
    if (roles.length === 0) {
      return true;
    }
    const count = await this.prisma.userModuleRole.count({
      where: {
        tenantId,
        userId,
        role: { in: [...roles] },
        user: { isActive: true },
      },
    });
    return count > 0;
  }
}
