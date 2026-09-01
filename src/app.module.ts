import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { CommonModule } from './common/common.module';
import { EntitlementsModule } from './entitlements/entitlements.module';
import { CrmModule } from './modules/crm/crm.module';
import { InvoicingModule } from './modules/invoicing/invoicing.module';
import { PaymentsModule } from './payments/payments.module';
import { PrismaModule } from './prisma/prisma.module';
import { RbacModule } from './rbac/rbac.module';
import { UsersModule } from './users/users.module';

@Module({
  // Ordine importantă: AuthModule ÎNAINTEA EntitlementsModule/RbacModule —
  // ModuleGuard/GlobalRoleGuard/ModuleRoleGuard (globale, din
  // EntitlementsModule/RbacModule) presupun că JwtAuthGuard (global, din
  // AuthModule) a rulat deja și a atașat req.user. Vezi module.guard.ts,
  // global-role.guard.ts, module-role.guard.ts.
  imports: [
    PrismaModule,
    CommonModule,
    AuthModule,
    EntitlementsModule,
    RbacModule,
    UsersModule,
    PaymentsModule,
    InvoicingModule,
    CrmModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
