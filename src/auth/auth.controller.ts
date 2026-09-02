import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AllowPreTenant } from './allow-pre-tenant.decorator';
import { AuthService, LoginResult } from './auth.service';
import { CurrentPreTenantUser, CurrentUser } from './current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { SwitchTenantDto } from './dto/switch-tenant.dto';
import type { AuthenticatedUser, PreTenantUser } from './jwt-payload.interface';
import { Public } from './public.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // @Public() — obligatoriu, altfel JwtAuthGuard (global) blochează
  // login-ul înainte să apuce cineva să obțină un token.
  // ThrottlerGuard rămâne local (nu global) — limitează brute-force pe
  // parole fără să afecteze alte rute viitoare fără discuție separată.
  @Public()
  @UseGuards(ThrottlerGuard)
  @HttpCode(200)
  @Post('login')
  login(@Body() dto: LoginDto): Promise<LoginResult> {
    return this.authService.login(dto.email, dto.password);
  }

  // Multi-firmă (docs/data-model.md): acceptă și tokenul „pre-tenant"
  // primit la login (user cu acces la mai multe firme), și un token deja
  // complet (userul își schimbă firma activă din mers) — vezi
  // @AllowPreTenant() și AuthService.switchTenant(). ThrottlerGuard local,
  // aceeași motivație ca la /auth/login — emite un JWT nou, la fel de
  // sensibil la abuz prin apeluri repetate.
  @AllowPreTenant()
  @UseGuards(ThrottlerGuard)
  @HttpCode(200)
  @Post('switch-tenant')
  switchTenant(
    @CurrentPreTenantUser() user: PreTenantUser,
    @Body() dto: SwitchTenantDto,
  ): Promise<LoginResult> {
    return this.authService.switchTenant(user.userId, dto.tenantId);
  }

  // Dovedește că JwtAuthGuard (global) + @CurrentUser funcționează
  // end-to-end, ȘI oferă `tenantName` pentru UI (header — „firma la care
  // sunt conectat"). Un query DB în plus per apel e acceptabil: e o rută
  // ieftină, apelată rar (o dată la login/reload), nu pe fiecare request.
  @Get('me')
  async me(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AuthenticatedUser & { tenantName: string }> {
    const tenantName = await this.authService.getTenantName(user.tenantId);
    return { ...user, tenantName };
  }
}
