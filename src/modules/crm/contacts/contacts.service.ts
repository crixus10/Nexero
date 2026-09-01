import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Contact, Prisma } from '@prisma/client';
import { CodeSequenceService } from '../../../common/code-sequence.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';

/**
 * Persoane de contact (modul CRM, docs/crm-spec.md). Regula #6 din
 * CLAUDE.md: fiecare query filtrează explicit după tenantId.
 */
@Injectable()
export class ContactsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly codeSequence: CodeSequenceService,
  ) {}

  async create(tenantId: string, dto: CreateContactDto): Promise<Contact> {
    if (dto.companyId) {
      await this.assertCompanyBelongsToTenant(tenantId, dto.companyId);
    }
    const contactCode = await this.codeSequence.nextFormatted(
      tenantId,
      'contact',
      'CTC',
    );
    try {
      return await this.prisma.contact.create({
        data: {
          tenantId,
          contactCode,
          name: dto.name,
          email: dto.email,
          phone: dto.phone,
          address: dto.address,
          position: dto.position,
          companyId: dto.companyId,
          // Cast explicit — DTO-ul (class-validator) e o listă tipată de
          // instanțe, nu un obiect JSON „plat"; Prisma cere InputJsonValue
          // pentru coloana Json. Fără `any` netratat (comentariu justificativ,
          // per regula de cod din CLAUDE.md).
          socialLinks: (dto.socialLinks ?? undefined) as
            Prisma.InputJsonValue | undefined,
        },
      });
    } catch (err) {
      throw this.translateForeignKeyConstraint(err, dto.companyId);
    }
  }

  async findAll(tenantId: string, q?: string): Promise<Contact[]> {
    return this.prisma.contact.findMany({
      where: q
        ? {
            tenantId,
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { email: { contains: q, mode: 'insensitive' } },
            ],
          }
        : { tenantId },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(tenantId: string, id: string): Promise<Contact> {
    const contact = await this.prisma.contact.findFirst({
      where: { id, tenantId },
    });
    if (!contact) {
      throw new NotFoundException(`Contactul „${id}” nu există.`);
    }
    return contact;
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateContactDto,
  ): Promise<Contact> {
    if (dto.companyId) {
      await this.assertCompanyBelongsToTenant(tenantId, dto.companyId);
    }
    let result: { count: number };
    try {
      result = await this.prisma.contact.updateMany({
        where: { id, tenantId },
        data: {
          name: dto.name,
          email: dto.email,
          phone: dto.phone,
          address: dto.address,
          position: dto.position,
          companyId: dto.companyId,
          socialLinks: dto.socialLinks as Prisma.InputJsonValue | undefined,
        },
      });
    } catch (err) {
      throw this.translateForeignKeyConstraint(err, dto.companyId ?? undefined);
    }
    if (result.count === 0) {
      throw new NotFoundException(`Contactul „${id}” nu există.`);
    }
    return this.findOne(tenantId, id);
  }

  // Fără gardă P2003 aici, deliberat — deals/tasks/notes.contact_id sunt
  // ON DELETE SET NULL (vezi migrarea), nu RESTRICT: un contact șters
  // devine „referință pierdută" pe acele înregistrări (rămân valide, doar
  // fără contact asociat), nu blochează ștergerea. Diferit de Company (unde
  // invoices.company_id e RESTRICT — o factură nu poate rămâne fără
  // client rezolvabil, cerință legală SAF-T).
  async remove(tenantId: string, id: string): Promise<void> {
    const { count } = await this.prisma.contact.deleteMany({
      where: { id, tenantId },
    });
    if (count === 0) {
      throw new NotFoundException(`Contactul „${id}” nu există.`);
    }
  }

  /**
   * Gardă IDOR — FK-ul Prisma pe `companyId` verifică doar că rândul
   * există undeva în DB, nu că aparține aceluiași tenant (nu cunoaște
   * conceptul de tenant). Fără asta, un `crm:agent` ar putea lega un
   * contact de o companie ghicită din alt tenant — numele/adresa acelei
   * companii ar apărea denormalizate pe fișa contactului, o scurgere
   * reală de date cross-tenant. Fix crm-guardian.
   */
  private async assertCompanyBelongsToTenant(
    tenantId: string,
    companyId: string,
  ): Promise<void> {
    const count = await this.prisma.company.count({
      where: { id: companyId, tenantId },
    });
    if (count === 0) {
      throw new BadRequestException(
        `Compania „${companyId}” nu există pentru această firmă.`,
      );
    }
  }

  private translateForeignKeyConstraint(
    err: unknown,
    companyId?: string,
  ): Error {
    if (this.isPrismaError(err, 'P2003') || this.isPrismaError(err, 'P2025')) {
      return new ConflictException(
        companyId
          ? `Compania „${companyId}” nu există — alege o companie validă sau lasă contactul fără companie.`
          : 'Referință invalidă.',
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
