import { SetMetadata } from '@nestjs/common';

export const MODULE_KEY = 'module';

/**
 * Marchează o rută ca aparținând unui modul plătit — ModuleGuard (global,
 * vezi entitlements.module.ts, APP_GUARD) verifică entitlement-ul firmei
 * pentru `moduleCode` înainte de a lăsa cererea să treacă. Fără această
 * adnotare, ModuleGuard nu face nimic (ruta nu ține de niciun modul).
 *
 * Tipar exact din docs/data-model.md:
 *   @RequireModule('invoicing')
 *   @Post('invoices')
 *   createInvoice(@Body() dto: CreateInvoiceDto) { ... }
 */
export const RequireModule = (moduleCode: string) =>
  SetMetadata(MODULE_KEY, moduleCode);
