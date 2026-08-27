import { Injectable } from '@nestjs/common';
import { TenantModule } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Sursa de adevăr pentru „ce modul are activ o firmă" — vezi
 * docs/data-model.md. Citește direct tabela tenant_modules, niciodată
 * altă cache/derivare.
 *
 * Interpretare "activ" (nescrisă literal în docs/data-model.md, fixată
 * aici ca decizie explicită): status = 'active', SAU status = 'trial' cu
 * trial_ends_at încă neexpirat (sau nesetat). 'past_due' și 'canceled'
 * NU dau acces — coerent cu fluxul documentat (past_due apare "din eșec"
 * de plată, deci trebuie să blocheze, nu doar să semnaleze).
 */
@Injectable()
export class EntitlementsService {
  constructor(private readonly prisma: PrismaService) {}

  async getActive(
    tenantId: string,
    moduleCode: string,
  ): Promise<TenantModule | null> {
    const entitlement = await this.prisma.tenantModule.findUnique({
      where: { tenantId_moduleCode: { tenantId, moduleCode } },
    });
    if (!entitlement) {
      return null;
    }

    if (entitlement.status === 'active') {
      return entitlement;
    }
    if (entitlement.status === 'trial') {
      const trialStillValid =
        !entitlement.trialEndsAt || entitlement.trialEndsAt > new Date();
      if (trialStillValid) {
        return entitlement;
      }
    }
    return null;
  }
}
