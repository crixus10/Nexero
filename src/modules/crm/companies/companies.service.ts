import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Company, Prisma } from '@prisma/client';
import { CodeSequenceService } from '../../../common/code-sequence.service';
import type { AnafCuiInfo } from '../../../integrations/anaf/anaf-cui-info.interface';
import { AnafService } from '../../../integrations/anaf/anaf.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';

export type CompanyWithTeam = Company & {
  teamMembers: {
    userId: string;
    user: { id: string; fullName: string; email: string };
  }[];
};

const TEAM_INCLUDE = {
  teamMembers: {
    include: { user: { select: { id: true, fullName: true, email: true } } },
  },
} satisfies Prisma.CompanyInclude;

/**
 * Modul CRM ("Clienți" în UI) — vezi docs/crm-spec.md. `Company` înlocuiește
 * fostul `Customer` (regula #6 din CLAUDE.md: fiecare query de mai jos
 * filtrează explicit după tenantId — niciodată doar id. tenantId vine mereu
 * din req.user.tenantId, niciodată din body).
 */
@Injectable()
export class CompaniesService {
  private readonly logger = new Logger(CompaniesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly anaf: AnafService,
    private readonly codeSequence: CodeSequenceService,
  ) {}

  async create(
    tenantId: string,
    dto: CreateCompanyDto,
  ): Promise<CompanyWithTeam> {
    if (dto.teamUserIds) {
      await this.assertUsersBelongToTenant(tenantId, dto.teamUserIds);
    }

    // Validare CUI prin adaptorul izolat (regula #5 din CLAUDE.md) —
    // niciodată apel direct către ANAF din acest serviciu. Doar dacă taxId
    // e dat: un lead fără CUI e valid.
    const resolvedTaxId = dto.taxId
      ? await this.resolveTaxId(dto.taxId)
      : undefined;

    // Cod auto-generat — cerință explicită („ID din nomenclatoare trebuie
    // să fie generate automat"), niciodată acceptat din input client.
    const companyCode = await this.codeSequence.nextFormatted(
      tenantId,
      'company',
      'CLI',
    );

    try {
      return await this.prisma.company.create({
        data: {
          tenantId,
          companyCode,
          taxId: resolvedTaxId?.cui, // normalizat, fără „RO”
          name: dto.name,
          address: dto.address,
          postalCode: dto.postalCode,
          city: dto.city,
          country: dto.country ?? 'RO',
          // isVatPayer explicit din client dacă e dat; altfel, valoarea
          // AUTORITATIVĂ din ANAF dacă a fost verificat online — vezi
          // comentariul echivalent din fostul CustomersService.create. Dacă
          // ANAF a fost indisponibil (resolvedTaxId.anafInfo absent),
          // rămâne implicit true — nu avem sursă autoritativă acum.
          isVatPayer:
            dto.isVatPayer ?? resolvedTaxId?.anafInfo?.isVatPayer ?? true,
          preferredLanguage: dto.preferredLanguage ?? 'ro',
          website: dto.website,
          email: dto.email,
          phone: dto.phone,
          description: dto.description,
          categories: dto.categories ?? [],
          connectionStrength: dto.connectionStrength,
          estimatedRevenueRange: dto.estimatedRevenueRange,
          teamMembers: dto.teamUserIds
            ? { create: dto.teamUserIds.map((userId) => ({ userId })) }
            : undefined,
        },
        include: TEAM_INCLUDE,
      });
    } catch (err) {
      throw this.translateUniqueConstraint(err, companyCode);
    }
  }

  async findAll(tenantId: string, q?: string): Promise<CompanyWithTeam[]> {
    return this.prisma.company.findMany({
      where: q
        ? {
            tenantId,
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { companyCode: { contains: q, mode: 'insensitive' } },
            ],
          }
        : { tenantId },
      include: TEAM_INCLUDE,
      orderBy: { name: 'asc' },
    });
  }

  async findOne(tenantId: string, id: string): Promise<CompanyWithTeam> {
    const company = await this.prisma.company.findFirst({
      where: { id, tenantId },
      include: TEAM_INCLUDE,
    });
    if (!company) {
      throw new NotFoundException(`Compania „${id}” nu există.`);
    }
    return company;
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateCompanyDto,
  ): Promise<CompanyWithTeam> {
    // taxId nedat (undefined) → neschimbat; taxId === '' → șters explicit
    // (null); orice altă valoare → revalidat prin ANAF (sau acceptat
    // neverificat, dacă ANAF e indisponibil — vezi resolveTaxId) — vezi
    // comentariul echivalent din fostul CustomersService.update.
    let resolvedTaxId: { cui: string; anafInfo?: AnafCuiInfo } | undefined;
    let taxIdUpdate: { taxId?: string | null } = {};
    if (dto.taxId === '') {
      taxIdUpdate = { taxId: null };
    } else if (dto.taxId) {
      resolvedTaxId = await this.resolveTaxId(dto.taxId);
      taxIdUpdate = { taxId: resolvedTaxId.cui };
    }

    const { teamUserIds, ...rest } = dto;
    if (teamUserIds) {
      await this.assertUsersBelongToTenant(tenantId, teamUserIds);
    }

    // Echipa (Team) se înlocuiește ca set — deleteMany + create în aceeași
    // tranzacție, nu un diff incremental (volumul e mic, câțiva useri per
    // companie; un diff ar complica fără beneficiu real aici).
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.company.updateMany({
        where: { id, tenantId },
        data: {
          ...rest,
          ...taxIdUpdate,
          isVatPayer: dto.isVatPayer ?? resolvedTaxId?.anafInfo?.isVatPayer,
        },
      });
      if (count === 0) {
        throw new NotFoundException(`Compania „${id}” nu există.`);
      }
      if (teamUserIds) {
        await tx.companyTeamMember.deleteMany({ where: { companyId: id } });
        if (teamUserIds.length > 0) {
          await tx.companyTeamMember.createMany({
            data: teamUserIds.map((userId) => ({ companyId: id, userId })),
          });
        }
      }
    });

    return this.findOne(tenantId, id);
  }

  async remove(tenantId: string, id: string): Promise<void> {
    try {
      const { count } = await this.prisma.company.deleteMany({
        where: { id, tenantId },
      });
      if (count === 0) {
        throw new NotFoundException(`Compania „${id}” nu există.`);
      }
    } catch (err) {
      throw this.translateForeignKeyConstraint(err);
    }
  }

  /**
   * Rezolvă un CUI introdus de utilizator: verificare online prin ANAF
   * (`AnafService.validateCui`) când e posibil, cu fallback la CUI-ul
   * introdus manual (doar normalizat, neverificat) dacă serviciul ANAF e
   * indisponibil temporar — cerință explicită a utilizatorului: o cădere
   * ANAF nu trebuie să blocheze salvarea companiei. Doar
   * `ServiceUnavailableException` (rețea/5xx/timeout/eroare ANAF, vezi
   * `AnafService.validateCui`) declanșează fallback-ul; un CUI cu format
   * greșit sau negăsit în registru (`BadRequestException`) rămâne respins
   * ca înainte — asta CHIAR e o eroare de-a utilizatorului, nu o cădere de
   * serviciu.
   */
  private async resolveTaxId(
    rawTaxId: string,
  ): Promise<{ cui: string; anafInfo?: AnafCuiInfo }> {
    try {
      const anafInfo = await this.anaf.validateCui(rawTaxId);
      return { cui: anafInfo.cui, anafInfo };
    } catch (err) {
      if (err instanceof ServiceUnavailableException) {
        this.logger.warn(
          `ANAF indisponibil — CUI „${rawTaxId}” acceptat neverificat (introducere manuală).`,
        );
        return { cui: this.anaf.normalizeCuiUnverified(rawTaxId) };
      }
      throw err;
    }
  }

  /**
   * Gardă IDOR: `CompanyTeamMember.userId` e o FK simplă către `users`,
   * fără verificare de tenant la nivel de DB — fără acest control, un
   * `crm:agent` ar putea „asigna" pe echipa unei companii un user dintr-o
   * altă firmă doar ghicind un UUID (nu i-ar da acces la nimic direct, dar
   * ar apărea denormalizat — nume/email — pe fișa companiei, o scurgere
   * reală de date cross-tenant). Aceeași motivație ca verificarea
   * `invoiceId` din DealsService.
   */
  private async assertUsersBelongToTenant(
    tenantId: string,
    userIds: string[],
  ): Promise<void> {
    if (userIds.length === 0) return;
    // user.count(tenantId) → userTenantAccess.count(...) — multi-firmă
    // (docs/data-model.md): apartenența la firmă nu mai e o coloană pe
    // `users`, e un rând ACTIV în `user_tenant_access`.
    const count = await this.prisma.userTenantAccess.count({
      where: { userId: { in: userIds }, tenantId, isActive: true },
    });
    if (count !== userIds.length) {
      throw new BadRequestException(
        'Unul sau mai mulți useri din teamUserIds nu aparțin acestei firme.',
      );
    }
  }

  private translateUniqueConstraint(err: unknown, companyCode: string): Error {
    if (this.isPrismaError(err, 'P2002')) {
      return new ConflictException(
        `Există deja o companie cu codul „${companyCode}” pentru această firmă.`,
      );
    }
    return err as Error;
  }

  private translateForeignKeyConstraint(err: unknown): Error {
    // P2003 — compania e referită de cel puțin o factură (invoices.company_id
    // e ON DELETE RESTRICT). Ștergerea unei companii neutilizate rămâne
    // posibilă — doar cele deja folosite pe un document sunt protejate.
    if (this.isPrismaError(err, 'P2003')) {
      return new ConflictException(
        'Compania nu poate fi ștearsă — e folosită pe cel puțin o factură.',
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
