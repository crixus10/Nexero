import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { RequestWithUser } from '../auth/jwt-payload.interface';
import { GLOBAL_ROLE_KEY } from './require-global-role.decorator';
import { RbacService } from './rbac.service';

/**
 * Global (vezi rbac.module.ts, APP_GUARD), ca @RequireGlobalRole să
 * funcționeze singur pe orice rută, fără @UseGuards. Trebuie să ruleze
 * DUPĂ JwtAuthGuard — aceeași plasă defensivă `!request.user` ca în
 * ModuleGuard (vezi src/entitlements/module.guard.ts).
 */
@Injectable()
export class GlobalRoleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rbac: RbacService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const allowedRoles = this.reflector.get<string[] | undefined>(
      GLOBAL_ROLE_KEY,
      context.getHandler(),
    );
    if (!allowedRoles || allowedRoles.length === 0) {
      return true; // ruta nu e restricționată pe rol global
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & Partial<RequestWithUser>>();
    if (!request.user) {
      throw new UnauthorizedException('Lipsește autentificarea.');
    }
    const { tenantId, userId } = request.user;

    const role = await this.rbac.getGlobalRole(tenantId, userId);
    if (!role || !allowedRoles.includes(role)) {
      throw new ForbiddenException(
        'Nu ai rolul necesar pentru această acțiune.',
      );
    }
    return true;
  }
}
