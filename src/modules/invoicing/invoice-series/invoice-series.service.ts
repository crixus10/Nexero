import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { InvoiceSeries } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateInvoiceSeriesDto } from './dto/create-invoice-series.dto';

/**
 * Gestiune serii de numerotare (`invoicing:admin` — docs/invoicing-spec.md,
 * „Roluri multi-user"). `nextNumber` pornește implicit de la 1 (default
 * Prisma) — nu expus în DTO, ca să nu se poată începe o serie nouă la un
 * număr arbitrar prin API (ar rupe garanția „fără goluri").
 *
 * Deliberat FĂRĂ `update()` — nici `seriesCode`, nici `documentType`, nici
 * (mai ales) `nextNumber` nu trebuie editabile după creare: ar rupe fie
 * coerența numerotării deja emise, fie garanția „fără goluri" (regula din
 * docs/invoicing-spec.md). O serie greșit configurată se șterge (dacă încă
 * nu a fost folosită — vezi `remove()`) și se recreează corect.
 */
@Injectable()
export class InvoiceSeriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    tenantId: string,
    dto: CreateInvoiceSeriesDto,
  ): Promise<InvoiceSeries> {
    try {
      return await this.prisma.invoiceSeries.create({
        data: {
          tenantId,
          seriesCode: dto.seriesCode,
          documentType: dto.documentType,
        },
      });
    } catch (err) {
      throw this.translateUniqueConstraint(err, dto.seriesCode);
    }
  }

  async findAll(tenantId: string, q?: string): Promise<InvoiceSeries[]> {
    return this.prisma.invoiceSeries.findMany({
      where: q
        ? { tenantId, seriesCode: { contains: q, mode: 'insensitive' } }
        : { tenantId },
      orderBy: { seriesCode: 'asc' },
    });
  }

  async remove(tenantId: string, id: string): Promise<void> {
    try {
      const { count } = await this.prisma.invoiceSeries.deleteMany({
        where: { id, tenantId },
      });
      if (count === 0) {
        throw new NotFoundException(`Seria „${id}” nu există.`);
      }
    } catch (err) {
      throw this.translateForeignKeyConstraint(err);
    }
  }

  private translateUniqueConstraint(err: unknown, seriesCode: string): Error {
    if (this.isPrismaError(err, 'P2002')) {
      return new ConflictException(
        `Există deja o serie cu codul „${seriesCode}” pentru această firmă.`,
      );
    }
    return err as Error;
  }

  private translateForeignKeyConstraint(err: unknown): Error {
    // P2003 — seria e referită de cel puțin o factură (invoices.series_id e
    // ON DELETE RESTRICT) — o serie deja folosită nu se poate șterge fără
    // să lase facturi orfane. O serie neutilizată încă rămâne ștergeabilă.
    if (this.isPrismaError(err, 'P2003')) {
      return new ConflictException(
        'Seria nu poate fi ștearsă — are cel puțin o factură emisă pe ea.',
      );
    }
    return err instanceof Error ? err : (err as Error);
  }

  private isPrismaError(err: unknown, code: string): boolean {
    return (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      err.code === code
    );
  }
}
