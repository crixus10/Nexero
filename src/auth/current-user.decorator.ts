import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedUser, RequestWithUser } from './jwt-payload.interface';

/**
 * @CurrentUser() într-un handler protejat de JwtAuthGuard — evită accesul
 * direct la request.user prin tot codul de business.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest<RequestWithUser>();
    return request.user;
  },
);
