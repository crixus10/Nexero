import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { EntitlementsService } from './entitlements.service';
import { ModuleGuard } from './module.guard';

/**
 * Nucleu (ca src/auth/, src/prisma/) — NU modul de business, nu stă în
 * src/modules/. Trebuie importat DUPĂ AuthModule în app.module.ts (vezi
 * comentariul din module.guard.ts despre ordinea guard-urilor globale).
 */
@Module({
  providers: [
    EntitlementsService,
    ModuleGuard,
    // useExisting (nu useClass) — o singură instanță, aceeași cu cea
    // injectabilă direct sub tokenul ModuleGuard.
    { provide: APP_GUARD, useExisting: ModuleGuard },
  ],
  exports: [EntitlementsService, ModuleGuard],
})
export class EntitlementsModule {}
