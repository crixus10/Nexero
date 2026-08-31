import { Module } from '@nestjs/common';
import { AnafService } from './anaf.service';

/**
 * Nucleu izolat (ca src/auth/, src/prisma/) — NU modul de business, nu stă
 * în src/modules/. Vezi regula #5 din CLAUDE.md. Exportă AnafService pentru
 * orice modul care are nevoie de validare CUI sau, ulterior, e-Factura/
 * e-TVA — niciodată reimplementat/duplicat per modul.
 */
@Module({
  providers: [AnafService],
  exports: [AnafService],
})
export class AnafModule {}
