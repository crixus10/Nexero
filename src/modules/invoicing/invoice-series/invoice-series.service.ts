import { ConflictException, Injectable } from '@nestjs/common';
import type { InvoiceSeries } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateInvoiceSeriesDto } from './dto/create-invoice-series.dto';

/**
 * Gestiune serii de numerotare (`invoicing:admin` — docs/invoicing-spec.md,
 * „Roluri multi-user"). `nextNumber` pornește implicit de la 1 (default
 * Prisma) — nu expus în DTO, ca să nu se poată începe o serie nouă la un
 * număr arbitrar prin API (ar rupe garanția „fără goluri").
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

  async findAll(tenantId: string): Promise<InvoiceSeries[]> {
    return this.prisma.invoiceSeries.findMany({
      where: { tenantId },
      orderBy: { seriesCode: 'asc' },
    });
  }

  private translateUniqueConstraint(err: unknown, seriesCode: string): Error {
    if (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      err.code === 'P2002'
    ) {
      return new ConflictException(
        `Există deja o serie cu codul „${seriesCode}” pentru această firmă.`,
      );
    }
    return err as Error;
  }
}
