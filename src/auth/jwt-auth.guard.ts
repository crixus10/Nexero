import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { AuthenticatedUser, JwtPayload } from './jwt-payload.interface';
import { IS_PUBLIC_KEY } from './public.decorator';

export type RequestWithUser = Request & { user: AuthenticatedUser };

/**
 * Guard minim, fără Passport (inutil pentru un singur flux JWT simplu).
 * Înregistrat GLOBAL (vezi auth.module.ts, APP_GUARD) — orice rută nouă,
 * din orice modul de business viitor, e protejată implicit, fără să
 * trebuiască adăugat @UseGuards manual pe fiecare controller. Rutele care
 * chiar trebuie să rămână publice (ex: /auth/login) se marchează explicit
 * cu @Public().
 *
 * Ce garantează: dacă un handler rulează, request.user.tenantId există și
 * vine dintr-un JWT valid semnat de noi. Ce NU garantează: că interogările
 * din handler chiar filtrează după el — regula #6 din CLAUDE.md rămâne
 * responsabilitatea codului din fiecare modul de business (acest guard e
 * doar precondiția care face regula posibil de respectat, nu o aplică
 * mecanic peste query-uri Prisma scrise manual).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);
    if (!token) {
      throw new UnauthorizedException('Lipsește tokenul de autentificare.');
    }

    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(token);
      (request as RequestWithUser).user = {
        userId: payload.sub,
        tenantId: payload.tenantId,
      };
    } catch {
      throw new UnauthorizedException('Token invalid sau expirat.');
    }

    return true;
  }

  private extractToken(request: Request): string | undefined {
    const header = request.headers.authorization;
    if (!header) return undefined;
    const [scheme, token] = header.split(' ');
    return scheme === 'Bearer' ? token : undefined;
  }
}
