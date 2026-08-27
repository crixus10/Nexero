import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { EntitlementsModule } from './entitlements/entitlements.module';
import { EntitlementsTestModule } from './entitlements/entitlements-test.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  // Ordine importantă: AuthModule ÎNAINTEA EntitlementsModule — ModuleGuard
  // (global, din EntitlementsModule) presupune că JwtAuthGuard (global, din
  // AuthModule) a rulat deja și a atașat req.user. Vezi module.guard.ts.
  imports: [
    PrismaModule,
    AuthModule,
    EntitlementsModule,
    EntitlementsTestModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
