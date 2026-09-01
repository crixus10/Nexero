import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Deal } from '@prisma/client';
import { CodeSequenceService } from '../../../common/code-sequence.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateDealDto } from './dto/create-deal.dto';
import { UpdateDealDto } from './dto/update-deal.dto';

/**
 * Deal-uri (oportunități de vânzare) — modul CRM, docs/crm-spec.md. Regula
 * #6 din CLAUDE.md: fiecare query filtrează explicit după tenantId.
 * `invoiceId` leagă un deal de o FACTURĂ REALĂ (nu un string decorativ) —
 * verificat explicit contra tenantId, FK-ul Prisma singur nu ține cont de
 * tenant (ar fi o gaură IDOR: un agent ar putea lega deal-ul de o factură a
 * altui tenant doar ghicind un UUID).
 */
@Injectable()
export class DealsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly codeSequence: CodeSequenceService,
  ) {}

  async create(tenantId: string, dto: CreateDealDto): Promise<Deal> {
    if (dto.invoiceId) {
      await this.assertInvoiceBelongsToTenant(tenantId, dto.invoiceId);
    }
    await this.assertLinksBelongToTenant(tenantId, dto);

    const year = new Date(dto.dealDate).getUTCFullYear();
    const dealCode = await this.codeSequence.nextFormatted(
      tenantId,
      `deal:${year}`,
      `DEAL-${year}`,
    );

    try {
      return await this.prisma.deal.create({
        data: {
          tenantId,
          dealCode,
          title: dto.title,
          contactId: dto.contactId,
          companyId: dto.companyId,
          totalValue: dto.totalValue,
          currency: dto.currency ?? 'RON',
          status: dto.status ?? 'proposal',
          priority: dto.priority ?? 'medium',
          dealDate: new Date(dto.dealDate),
          expectedCloseDate: dto.expectedCloseDate
            ? new Date(dto.expectedCloseDate)
            : undefined,
          discountPercent: dto.discountPercent,
          paymentMethod: dto.paymentMethod,
          invoiceId: dto.invoiceId,
        },
      });
    } catch (err) {
      throw this.translateForeignKeyConstraint(err);
    }
  }

  async findAll(tenantId: string, q?: string): Promise<Deal[]> {
    return this.prisma.deal.findMany({
      where: q
        ? { tenantId, title: { contains: q, mode: 'insensitive' } }
        : { tenantId },
      orderBy: { dealDate: 'desc' },
    });
  }

  async findOne(tenantId: string, id: string): Promise<Deal> {
    const deal = await this.prisma.deal.findFirst({ where: { id, tenantId } });
    if (!deal) {
      throw new NotFoundException(`Deal-ul „${id}” nu există.`);
    }
    return deal;
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateDealDto,
  ): Promise<Deal> {
    if (dto.invoiceId) {
      await this.assertInvoiceBelongsToTenant(tenantId, dto.invoiceId);
    }
    await this.assertLinksBelongToTenant(tenantId, dto);

    let result: { count: number };
    try {
      result = await this.prisma.deal.updateMany({
        where: { id, tenantId },
        data: {
          title: dto.title,
          contactId: dto.contactId,
          companyId: dto.companyId,
          totalValue: dto.totalValue,
          currency: dto.currency,
          status: dto.status,
          priority: dto.priority,
          dealDate: dto.dealDate ? new Date(dto.dealDate) : undefined,
          // `null` explicit golește data estimată de închidere; `undefined`
          // (cheie omisă) înseamnă neschimbat — vezi comentariul echivalent
          // din TasksService.update.
          expectedCloseDate:
            dto.expectedCloseDate === undefined
              ? undefined
              : dto.expectedCloseDate === null
                ? null
                : new Date(dto.expectedCloseDate),
          discountPercent: dto.discountPercent,
          paymentMethod: dto.paymentMethod,
          invoiceId: dto.invoiceId,
        },
      });
    } catch (err) {
      throw this.translateForeignKeyConstraint(err);
    }
    if (result.count === 0) {
      throw new NotFoundException(`Deal-ul „${id}” nu există.`);
    }
    return this.findOne(tenantId, id);
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const { count } = await this.prisma.deal.deleteMany({
      where: { id, tenantId },
    });
    if (count === 0) {
      throw new NotFoundException(`Deal-ul „${id}” nu există.`);
    }
  }

  private async assertInvoiceBelongsToTenant(
    tenantId: string,
    invoiceId: string,
  ): Promise<void> {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId },
      select: { id: true },
    });
    if (!invoice) {
      throw new BadRequestException(
        `Factura „${invoiceId}” nu există pentru această firmă.`,
      );
    }
  }

  /**
   * Gardă IDOR pe `contactId`/`companyId` — FK-ul Prisma verifică doar că
   * rândul există undeva în DB, nu că aparține aceluiași tenant. Fix
   * crm-guardian: motivația completă e identică cu
   * `assertInvoiceBelongsToTenant` de mai sus.
   */
  private async assertLinksBelongToTenant(
    tenantId: string,
    dto: CreateDealDto | UpdateDealDto,
  ): Promise<void> {
    if (dto.contactId) {
      const count = await this.prisma.contact.count({
        where: { id: dto.contactId, tenantId },
      });
      if (count === 0) {
        throw new BadRequestException(
          `Contactul „${dto.contactId}” nu există pentru această firmă.`,
        );
      }
    }
    if (dto.companyId) {
      const count = await this.prisma.company.count({
        where: { id: dto.companyId, tenantId },
      });
      if (count === 0) {
        throw new BadRequestException(
          `Compania „${dto.companyId}” nu există pentru această firmă.`,
        );
      }
    }
  }

  private translateForeignKeyConstraint(err: unknown): Error {
    if (this.isPrismaError(err, 'P2003')) {
      return new ConflictException(
        'Referință invalidă (contact, companie sau factură inexistentă).',
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
