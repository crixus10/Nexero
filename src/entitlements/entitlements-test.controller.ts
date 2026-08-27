import { Controller, Get, Req } from '@nestjs/common';
import { RequireModule } from './require-module.decorator';
import type { RequestWithEntitlement } from './module.guard';

/**
 * TEMPORAR — endpoint de verificare pentru lanțul complet
 * JwtAuthGuard -> ModuleGuard -> @RequireModule, cerut explicit pentru
 * testare manuală (nu e logică de business reală). De șters odată ce
 * modulul 1 (Facturare, per docs/roadmap.md) are propriile rute
 * protejate cu @RequireModule('invoicing') — nu ține locul lui.
 */
@Controller('entitlements-test')
export class EntitlementsTestController {
  @RequireModule('test')
  @Get('ping')
  ping(@Req() req: RequestWithEntitlement): {
    tenantId: string;
    moduleCode: string;
    entitlementStatus: string;
  } {
    return {
      tenantId: req.user.tenantId,
      moduleCode: req.entitlement.moduleCode,
      entitlementStatus: req.entitlement.status,
    };
  }
}
