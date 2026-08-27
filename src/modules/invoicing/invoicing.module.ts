import { Module } from '@nestjs/common';
import { InvoicingController } from './invoicing.controller';

/**
 * Modul de business izolat (regula #2 din CLAUDE.md) — graniță de cod
 * clară, sub src/modules/, spre deosebire de nucleul din src/auth/,
 * src/entitlements/, src/payments/, src/prisma/. Nu importă fișiere
 * interne din alt modul; comunică doar prin servicii publice (niciunul
 * încă — fără logică de business în acest stadiu).
 */
@Module({
  controllers: [InvoicingController],
})
export class InvoicingModule {}
