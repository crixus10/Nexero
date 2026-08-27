import type { Request } from 'express';

/**
 * Payload-ul JWT emis la login și forma lui `req.user` după JwtAuthGuard.
 * `sub` (subject) e convenția JWT standard pentru id-ul userului.
 * Orice guard viitor (ex: ModuleGuard, vezi docs/data-model.md) citește
 * tenantId de aici, nu dintr-un `req.tenant` separat.
 */
export interface JwtPayload {
  sub: string;
  tenantId: string;
}

export interface AuthenticatedUser {
  userId: string;
  tenantId: string;
}

/**
 * Contractul public al src/auth/ pentru orice cod din afara modulului
 * (guard-uri viitoare, alte module) — regula #2 din CLAUDE.md: nu importa
 * tipuri din jwt-auth.guard.ts (fișier de implementare), importă de aici.
 */
export type RequestWithUser = Request & { user: AuthenticatedUser };
