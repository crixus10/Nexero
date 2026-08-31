import { SetMetadata } from '@nestjs/common';

export const GLOBAL_ROLE_KEY = 'globalRoles';

/**
 * Marchează o rută ca restricționată la roluri GLOBALE (companie) — vezi
 * docs/data-model.md, secțiunea „RBAC — users.role (global) + user_module_roles (per-modul)". GlobalRoleGuard
 * (global, vezi rbac.module.ts, APP_GUARD) verifică `users.role` al
 * userului curent contra listei date. Fără această adnotare, guard-ul nu
 * face nimic (ruta nu e restricționată pe rol global).
 *
 *   @RequireGlobalRole('owner', 'admin')
 *   @Post('users')
 *   createUser(...) { ... }
 */
export const RequireGlobalRole = (...roles: string[]) =>
  SetMetadata(GLOBAL_ROLE_KEY, roles);
