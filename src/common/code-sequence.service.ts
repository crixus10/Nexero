import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Coduri auto-generate (CLI-0001, PRD-0001, CTC-0001, DEAL-2026-0001...) —
 * mecanism de NUCLEU (`CodeSequence`, docs/data-model.md), reutilizabil de
 * orice modul. Alocare atomică prin `upsert` (INSERT ... ON CONFLICT DO
 * UPDATE la nivel de Postgres, deci sigur la concurență fără `$transaction`
 * explicit) — niciodată `MAX(cod)+1` (cursă: două creări simultane ar putea
 * aloca același număr).
 *
 * Distinct de `InvoiceSeries.nextNumber` (invoices/invoice-series.service.ts):
 * acolo o gaură în numerotare e o încălcare legală (SAF-T) și necesită
 * `$transaction` cu factura creată în același pas. Aici (companii, produse,
 * contacte, deal-uri) codul e doar un identificator mnemonic — o gaură
 * ocazională (ex. request eșuat după alocare) nu are nicio implicație legală,
 * deci nu justifică complexitatea unei tranzacții comune cu insert-ul.
 */
@Injectable()
export class CodeSequenceService {
  constructor(private readonly prisma: PrismaService) {}

  /** Alocă următorul număr întreg pentru (tenantId, entityType). */
  async next(tenantId: string, entityType: string): Promise<number> {
    const seq = await this.prisma.codeSequence.upsert({
      where: { tenantId_entityType: { tenantId, entityType } },
      create: { tenantId, entityType, nextValue: 2 },
      update: { nextValue: { increment: 1 } },
    });
    // Valid și pe ramura create (nextValue seed-uit la 2 mai sus) și pe cea
    // de update (incrementat cu 1) — numărul alocat e mereu nextValue - 1.
    return seq.nextValue - 1;
  }

  /** Alocă și formatează direct, ex. `next(tenantId, 'company', 'CLI')` → `CLI-0001`. */
  async nextFormatted(
    tenantId: string,
    entityType: string,
    prefix: string,
    digits = 4,
  ): Promise<string> {
    const n = await this.next(tenantId, entityType);
    return `${prefix}-${String(n).padStart(digits, '0')}`;
  }
}
