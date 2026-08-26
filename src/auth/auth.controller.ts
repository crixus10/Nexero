import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import { LoginDto } from './dto/login.dto';
import type { AuthenticatedUser } from './jwt-payload.interface';
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
  login(@Body() dto: LoginDto): Promise<{ accessToken: string }> {
    return this.authService.login(dto.email, dto.password);
  }

  // Rută minimă de verificare — dovedește că JwtAuthGuard (acum global,
  // fără @UseGuards explicit aici) + @CurrentUser funcționează end-to-end.
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }
}
