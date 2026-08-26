import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { AuthenticatedUser, JwtPayload } from './jwt-payload.interface';

export type RequestWithUser = Request & { user: AuthenticatedUser };

/**
 * Guard minim, fără Passport (inutil pentru un singur flux JWT simplu).
 * Orice modul de business viitor care are nevoie de tenantId îl citește
 * din request.user.tenantId, atașat aici — vezi docs/data-model.md.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
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
