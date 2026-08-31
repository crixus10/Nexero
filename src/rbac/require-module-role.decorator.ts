import { SetMetadata } from '@nestjs/common';

export const MODULE_ROLE_KEY = 'moduleRoles';

/**
 * Marchează o rută ca restricționată la roluri PER-MODUL (ex.
 * `invoicing:issuer`) — vezi docs/invoicing-spec.md, secțiunea „Roluri
 * multi-user". ModuleRoleGuard (global, vezi rbac.module.ts, APP_GUARD)
 * verifică `user_module_roles` al userului curent contra listei date (
 * „oricare din" — orice rol din listă e suficient). Se folosește ÎMPREUNĂ
 * cu @RequireModule('invoicing') pe același handler, nu în locul lui —
 * @RequireModuleRole verifică CINE poate face acțiunea, @RequireModule
 * verifică dacă firma are deloc modulul activ; cele două nu se
 * substituie una pe alta.
 *
 *   @RequireModule('invoicing')
 *   @RequireModuleRole('invoicing:issuer', 'invoicing:admin')
 *   @Post('invoices')
 *   createInvoice(...) { ... }
 */
export const RequireModuleRole = (...roles: string[]) =>
  SetMetadata(MODULE_ROLE_KEY, roles);
