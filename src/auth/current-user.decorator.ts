import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import {
  AuthenticatedUser,
  PreTenantUser,
  RequestWithPreTenantUser,
  RequestWithUser,
} from './jwt-payload.interface';

/**
 * @CurrentUser() într-un handler protejat de JwtAuthGuard — evită accesul
 * direct la request.user prin tot codul de business. Doar pentru rute
 * NORMALE (fără @AllowPreTenant()) — JwtAuthGuard garantează acolo că
 * tenantId există.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest<RequestWithUser>();
    return request.user;
  },
);

/**
 * Echivalentul @CurrentUser() pentru rutele @AllowPreTenant() (ex:
 * POST /auth/switch-tenant) — userul poate avea un token „pre-tenant"
 * (fără tenantId încă), deci expune doar `userId`, garantat mereu prezent.
 */
export const CurrentPreTenantUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): PreTenantUser => {
    const request = ctx.switchToHttp().getRequest<RequestWithPreTenantUser>();
    return { userId: request.user.userId };
  },
);
