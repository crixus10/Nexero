import type { Request } from 'express';

/**
 * Payload-ul JWT emis la login și forma lui `req.user` după JwtAuthGuard.
 * `sub` (subject) e convenția JWT standard pentru id-ul userului.
 *
 * `tenantId` lipsește DOAR pe tokenul „pre-tenant" — emis la login unui
 * user cu acces la mai multe firme (vezi docs/data-model.md, secțiunea
 * „Multi-firmă"), înainte ca el să aleagă firma activă prin
 * `POST /auth/switch-tenant`. Orice altă rută protejată (fără
 * `@AllowPreTenant()`) respinge un token fără `tenantId` — vezi
 * jwt-auth.guard.ts.
 */
export interface JwtPayload {
  sub: string;
  tenantId?: string;
}

export interface AuthenticatedUser {
  userId: string;
  tenantId: string;
}

/** Userul autentificat, dar fără firmă activă aleasă încă — vezi @AllowPreTenant(). */
export interface PreTenantUser {
  userId: string;
}

/**
 * Contractul public al src/auth/ pentru orice cod din afara modulului
 * (guard-uri viitoare, alte module) — regula #2 din CLAUDE.md: nu importa
 * tipuri din jwt-auth.guard.ts (fișier de implementare), importă de aici.
 */
export type RequestWithUser = Request & { user: AuthenticatedUser };

/** Echivalentul RequestWithUser pentru rutele @AllowPreTenant() (ex: switch-tenant). */
export type RequestWithPreTenantUser = Request & {
  user: PreTenantUser | AuthenticatedUser;
};
