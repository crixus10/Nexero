import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Sursa de adevăr pentru cele două niveluri de rol — vezi
 * docs/data-model.md, secțiunea „RBAC — users.role (global) + user_module_roles (per-modul)"
 * (rolul global stă azi pe `user_tenant_access.role`, nu pe `users.role` —
 * coloana a fost eliminată, vezi nota din acea secțiune) + „Multi-firmă —
 * un user poate accesa mai multe firme (user_tenant_access)".
 * Citire live din DB la fiecare verificare (nu din JWT), la fel ca
 * EntitlementsService pentru module: dacă un owner retrogradează pe
 * cineva, îi revocă un rol de modul, SAU îi revocă accesul la firmă,
 * efectul e imediat, nu așteaptă expirarea unui token deja emis.
 *
 * Ambele metode de mai jos aplică ACELEAȘI două condiții de bază — user
 * activ GLOBAL (`users.isActive`) ȘI acces activ la firma curentă
 * (`user_tenant_access.isActive`) — fix rbac-guardian: cele două guard-uri
 * (GlobalRoleGuard/ModuleRoleGuard) trebuie să ofere garanții simetrice,
 * nu doar fiecare separat corectă.
 */
@Injectable()
export class RbacService {
  constructor(private readonly prisma: PrismaService) {}

  /** Rolul GLOBAL (companie) al userului PE FIRMA CURENTĂ — 'owner' | 'admin' | 'accountant' | 'operator'. */
  async getGlobalRole(
    tenantId: string,
    userId: string,
  ): Promise<string | null> {
    const access = await this.prisma.userTenantAccess.findFirst({
      where: {
        userId,
        tenantId,
        isActive: true,
        user: { isActive: true },
      },
      select: { role: true },
    });
    return access?.role ?? null;
  }

  /**
   * Adevărat dacă userul are CEL PUȚIN unul dintre rolurile per-modul date
   * (ex. `['invoicing:issuer', 'invoicing:admin']`) — folosit pentru
   * verificări „oricare din" (un issuer sau un admin pot ambii emite).
   *
   * `user: { isActive: true, tenantAccess: { some: {...} } }` — fix
   * system-orchestrator (audit holistic) + fix rbac-guardian (multi-firmă):
   * fără `user.isActive`, un user dezactivat GLOBAL își păstra accesul pe
   * orice rută protejată DOAR cu `@RequireModuleRole` până la expirarea
   * JWT-ului deja emis; fără `tenantAccess`, un user căruia i s-a revocat
   * accesul la ACEASTĂ firmă (dar are rânduri orfane în
   * `user_module_roles`, dintr-o firmă la care nu mai are voie) trecea tot
   * la fel — ambele contrazic garanția „citire live, efect imediat".
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
        user: {
          isActive: true,
          tenantAccess: { some: { tenantId, isActive: true } },
        },
      },
    });
    return count > 0;
  }
}
