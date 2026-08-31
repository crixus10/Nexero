import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Customer } from '@prisma/client';
import type { AnafCuiInfo } from '../../../integrations/anaf/anaf-cui-info.interface';
import { AnafService } from '../../../integrations/anaf/anaf.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

/**
 * Fază B.1 din docs/roadmap.md — CRUD clienți +
 * validare CUI. Regula #6 din CLAUDE.md: fiecare query de mai jos
 * filtrează explicit după tenantId — niciodată doar id. tenantId vine
 * mereu din req.user.tenantId (CustomersController via @CurrentUser()),
 * niciodată din body.
 */
@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly anaf: AnafService,
  ) {}

  async create(tenantId: string, dto: CreateCustomerDto): Promise<Customer> {
    // Validare CUI prin adaptorul izolat (regula #5 din CLAUDE.md) —
    // niciodată apel direct către ANAF din acest serviciu. Doar dacă taxId
    // e dat: un client B2C fără CUI e valid (vezi CreateCustomerDto).
    const anafInfo = dto.taxId
      ? await this.anaf.validateCui(dto.taxId)
      : undefined;

    try {
      return await this.prisma.customer.create({
        data: {
          tenantId,
          customerCode: dto.customerCode,
          taxId: anafInfo?.cui, // normalizat, fără „RO”
          name: dto.name,
          address: dto.address,
          postalCode: dto.postalCode,
          city: dto.city,
          country: dto.country ?? 'RO',
          // isVatPayer explicit din client dacă e dat; altfel, valoarea
          // AUTORITATIVĂ din ANAF (nu presupunerea implicită "true") —
          // fix logic-reviewer: altfel un CUI pe care ANAF îl arată
          // neplătitor de TVA putea rămâne marcat greșit ca plătitor,
          // afectând tratamentul TVA la facturare.
          isVatPayer: dto.isVatPayer ?? anafInfo?.isVatPayer ?? true,
          preferredLanguage: dto.preferredLanguage ?? 'ro',
        },
      });
    } catch (err) {
      throw this.translateUniqueConstraint(err, dto.customerCode);
    }
  }

  async findAll(tenantId: string): Promise<Customer[]> {
    return this.prisma.customer.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(tenantId: string, id: string): Promise<Customer> {
    const customer = await this.prisma.customer.findFirst({
      where: { id, tenantId },
    });
    if (!customer) {
      throw new NotFoundException(`Clientul „${id}” nu există.`);
    }
    return customer;
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateCustomerDto,
  ): Promise<Customer> {
    // taxId nedat (undefined) → neschimbat; taxId === '' → șters explicit
    // (null); orice altă valoare → revalidat prin ANAF. Fără distincția
    // asta, un CUI greșit introdus o dată nu putea fi niciodată șters prin
    // API (fix logic-reviewer — minor, dar o gaură reală de operare).
    let anafInfo: AnafCuiInfo | undefined;
    let taxIdUpdate: { taxId?: string | null } = {};
    if (dto.taxId === '') {
      taxIdUpdate = { taxId: null };
    } else if (dto.taxId) {
      anafInfo = await this.anaf.validateCui(dto.taxId);
      taxIdUpdate = { taxId: anafInfo.cui };
    }

    // updateMany (nu update) — where poate filtra pe tenantId direct
    // (regula #6), spre deosebire de update(), limitat la un where unic pe
    // PK. count === 0 acoperă deopotrivă „nu există” și „aparține altui
    // tenant” — același 404, fără să dezvăluie diferența unui atacator.
    const { count } = await this.prisma.customer.updateMany({
      where: { id, tenantId },
      data: {
        ...dto,
        ...taxIdUpdate,
        // Vezi comentariul echivalent din create() — reconciliat cu ANAF
        // doar dacă taxId a fost efectiv revalidat acum; altfel neschimbat.
        isVatPayer: dto.isVatPayer ?? anafInfo?.isVatPayer,
      },
    });
    if (count === 0) {
      throw new NotFoundException(`Clientul „${id}” nu există.`);
    }
    return this.findOne(tenantId, id);
  }

  private translateUniqueConstraint(err: unknown, customerCode: string): Error {
    if (this.isUniqueConstraintError(err)) {
      return new ConflictException(
        `Există deja un client cu customerCode „${customerCode}” pentru această firmă.`,
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
