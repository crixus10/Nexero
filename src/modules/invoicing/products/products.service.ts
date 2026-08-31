import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Product } from '@prisma/client';
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
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, dto: CreateProductDto): Promise<Product> {
    try {
      return await this.prisma.product.create({
        data: {
          tenantId,
          productCode: dto.productCode,
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
      throw this.translateUniqueConstraint(err, dto.productCode);
    }
  }

  async findAll(tenantId: string): Promise<Product[]> {
    return this.prisma.product.findMany({
      where: { tenantId },
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
    // (regula #6). Vezi comentariul echivalent din CustomersService.update.
    const { count } = await this.prisma.product.updateMany({
      where: { id, tenantId },
      data: dto,
    });
    if (count === 0) {
      throw new NotFoundException(`Produsul „${id}” nu există.`);
    }
    return this.findOne(tenantId, id);
  }

  private translateUniqueConstraint(err: unknown, productCode: string): Error {
    if (this.isUniqueConstraintError(err)) {
      return new ConflictException(
        `Există deja un produs cu productCode „${productCode}” pentru această firmă.`,
      );
    }
    return err as Error;
  }

  private isUniqueConstraintError(err: unknown): boolean {
    return (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      err.code === 'P2002'
    );
  }
}
