import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Product } from '@prisma/client';
import { CodeSequenceService } from '../../../common/code-sequence.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

/**
 * Fază B.2 din docs/roadmap.md — CRUD produse/
 * servicii. Regula #6 din CLAUDE.md: fiecare query filtrează explicit
 * după tenantId — niciodată doar id.
 */
@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly codeSequence: CodeSequenceService,
  ) {}

  async create(tenantId: string, dto: CreateProductDto): Promise<Product> {
    // Cod auto-generat — cerință explicită, niciodată acceptat din input
    // client (vezi comentariul din CreateProductDto).
    const productCode = await this.codeSequence.nextFormatted(
      tenantId,
      'product',
      'PRD',
    );
    try {
      return await this.prisma.product.create({
        data: {
          tenantId,
          productCode,
          description: dto.description,
          unitOfMeasure: dto.unitOfMeasure,
          defaultTaxType: dto.defaultTaxType,
          unitPrice: dto.unitPrice,
          // Obligatoriu în CreateProductDto — niciun fallback silențios pe
          // '707' aici (vezi comentariul din DTO).
          revenueAccount: dto.revenueAccount,
        },
      });
    } catch (err) {
      throw this.translateUniqueConstraint(err, productCode);
    }
  }

  async findAll(tenantId: string, q?: string): Promise<Product[]> {
    return this.prisma.product.findMany({
      where: q
        ? {
            tenantId,
            OR: [
              { description: { contains: q, mode: 'insensitive' } },
              { productCode: { contains: q, mode: 'insensitive' } },
            ],
          }
        : { tenantId },
      orderBy: { description: 'asc' },
    });
  }

  async findOne(tenantId: string, id: string): Promise<Product> {
    const product = await this.prisma.product.findFirst({
      where: { id, tenantId },
    });
    if (!product) {
      throw new NotFoundException(`Produsul „${id}” nu există.`);
    }
    return product;
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateProductDto,
  ): Promise<Product> {
    // updateMany, nu update — where poate filtra pe tenantId direct
    // (regula #6). Vezi comentariul echivalent din CompaniesService.update
    // (modulul crm).
    const { count } = await this.prisma.product.updateMany({
      where: { id, tenantId },
      data: dto,
    });
    if (count === 0) {
      throw new NotFoundException(`Produsul „${id}” nu există.`);
    }
    return this.findOne(tenantId, id);
  }

  async remove(tenantId: string, id: string): Promise<void> {
    try {
      const { count } = await this.prisma.product.deleteMany({
        where: { id, tenantId },
      });
      if (count === 0) {
        throw new NotFoundException(`Produsul „${id}” nu există.`);
      }
    } catch (err) {
      throw this.translateForeignKeyConstraint(err);
    }
  }

  private translateUniqueConstraint(err: unknown, productCode: string): Error {
    if (this.isPrismaError(err, 'P2002')) {
      return new ConflictException(
        `Există deja un produs cu productCode „${productCode}” pentru această firmă.`,
      );
    }
    return err as Error;
  }

  private translateForeignKeyConstraint(err: unknown): Error {
    // P2003 — produsul e referit de cel puțin o linie de factură
    // (invoice_lines.product_id e ON DELETE RESTRICT, deliberat: ProductCode
    // e obligatoriu SAF-T pe orice linie deja emisă). Ștergerea unui produs
    // neutilizat rămâne posibilă.
    if (this.isPrismaError(err, 'P2003')) {
      return new ConflictException(
        'Produsul nu poate fi șters — e folosit pe cel puțin o factură.',
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
