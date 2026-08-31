import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { GlobalRoleGuard } from './global-role.guard';
import { ModuleRoleGuard } from './module-role.guard';
import { RbacService } from './rbac.service';

/**
 * Nucleu (ca src/auth/, src/entitlements/, src/prisma/) — NU modul de
 * business, nu stă în src/modules/. Trebuie importat DUPĂ AuthModule în
 * app.module.ts (aceeași ordine ca EntitlementsModule — vezi comentariul
 * din global-role.guard.ts/module-role.guard.ts despre ordinea guard-
 * urilor globale).
 */
@Module({
  providers: [
    RbacService,
    GlobalRoleGuard,
    ModuleRoleGuard,
    { provide: APP_GUARD, useExisting: GlobalRoleGuard },
    { provide: APP_GUARD, useExisting: ModuleRoleGuard },
  ],
  exports: [RbacService, GlobalRoleGuard, ModuleRoleGuard],
})
export class RbacModule {}
