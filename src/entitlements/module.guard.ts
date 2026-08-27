import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TenantModule } from '@prisma/client';
import type { Request } from 'express';
import type { RequestWithUser } from '../auth/jwt-payload.interface';
import { EntitlementsService } from './entitlements.service';
import { MODULE_KEY } from './require-module.decorator';

export type RequestWithEntitlement = RequestWithUser & {
  entitlement: TenantModule;
};

/**
 * Tipar exact din docs/data-model.md, secțiunea "Tiparul de verificare
 * acces (guard)" — global (vezi entitlements.module.ts, APP_GUARD), ca să
 * @RequireModule('x') funcționeze singur pe orice rută, fără @UseGuards.
 *
 * Ordine obligatorie: JwtAuthGuard (src/auth/) trebuie să ruleze ÎNAINTE
 * — AuthModule e importat înaintea EntitlementsModule în app.module.ts.
 * Verificarea `!request.user` de mai jos e o plasă de siguranță
 * defensivă, nu o presupunere oarbă a ordinii: dacă cineva schimbă
 * ordinea de import și ModuleGuard ajunge să ruleze primul, primim un
 * 401 clar, nu un TypeError nedeslușit -> 500.
 */
@Injectable()
export class ModuleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly entitlements: EntitlementsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const moduleCode = this.reflector.get<string | undefined>(
      MODULE_KEY,
      context.getHandler(),
    );
    if (!moduleCode) {
      return true; // ruta nu ține de un modul plătit
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & Partial<RequestWithUser>>();
    if (!request.user) {
      throw new UnauthorizedException('Lipsește autentificarea.');
    }
    const { tenantId } = request.user;

    const entitlement = await this.entitlements.getActive(tenantId, moduleCode);
    if (!entitlement) {
      throw new ForbiddenException(
        `Modulul "${moduleCode}" nu e activ pentru firmă.`,
      );
    }
    (request as RequestWithEntitlement).entitlement = entitlement; // util pentru metering ulterior
    return true;
  }
}
