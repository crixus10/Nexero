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
import { MODULE_ROLE_KEY } from './require-module-role.decorator';
import { RbacService } from './rbac.service';

/**
 * Global (vezi rbac.module.ts, APP_GUARD) — verifică `user_module_roles`,
 * DISTINCT de ModuleGuard (care verifică doar dacă firma are modulul activ,
 * nu cine anume din firmă poate face acțiunea). Trebuie să ruleze DUPĂ
 * JwtAuthGuard — aceeași plasă defensivă `!request.user` ca în ModuleGuard.
 */
@Injectable()
export class ModuleRoleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rbac: RbacService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const allowedRoles = this.reflector.get<string[] | undefined>(
      MODULE_ROLE_KEY,
      context.getHandler(),
    );
    if (!allowedRoles || allowedRoles.length === 0) {
      return true; // ruta nu e restricționată pe rol de modul
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & Partial<RequestWithUser>>();
    // Plasă defensivă explicită, nu doar convenție — fix rbac-guardian, la
    // fel ca în GlobalRoleGuard (vezi comentariul acolo).
    if (!request.user || !request.user.tenantId) {
      throw new UnauthorizedException(
        'Lipsește autentificarea sau firma activă (alege firma prin POST /auth/switch-tenant).',
      );
    }
    const { tenantId, userId } = request.user;

    const allowed = await this.rbac.hasAnyModuleRole(
      tenantId,
      userId,
      allowedRoles,
    );
    if (!allowed) {
      throw new ForbiddenException(
        'Nu ai rolul de modul necesar pentru această acțiune.',
      );
    }
    return true;
  }
}
