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
