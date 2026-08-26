import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { Public } from './auth/public.decorator';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  // Health-check trivial, nu e rută de business — public, altfel
  // orchestratorul de deploy (Docker/Hetzner) n-ar putea verifica liveness
  // fără un token JWT.
  @Public()
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}
