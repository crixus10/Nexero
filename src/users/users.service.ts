import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type User, type UserModuleRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { AssignModuleRoleDto } from './dto/assign-module-role.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

// Aceeași valoare ca în src/auth/auth.service.ts (BCRYPT_ROUNDS) — nu
// extras într-un helper comun ca să nu introducă un import cross-modul
// între auth/ și users/ pentru o singură constantă; ține-le sincronizate
// dacă una se schimbă.
const BCRYPT_ROUNDS = 10;

/**
 * Identitatea (users) + accesul/rolul PE FIRMA CURENTĂ (user_tenant_access)
 * — forma pe care o vede UsersController, scopat mereu la un singur
 * tenant. Aceeași formă ca înainte de multi-firmă (docs/data-model.md),
 * doar sursa lui `role`/`isActive` s-a mutat de pe `users` pe rândul de
 * acces al firmei curente.
 */
export interface SafeUser {
  id: string;
  tenantId: string;
  email: string;
  fullName: string;
  role: string;
  isActive: boolean;
  createdAt: Date;
}

type AccessRow = { tenantId: string; role: string; isActive: boolean };

/**
 * Management complet de useri (creare/listare/actualizare/dezactivare +
 * roluri per-modul), scopat mereu la o singură firmă — nucleu, ca
 * src/auth/. Regula #6 din CLAUDE.md: fiecare query filtrează explicit
 * după tenantId — un owner/admin gestionează DOAR accesul userilor la
 * PROPRIA firmă, niciodată cross-tenant; el nu poate edita identitatea
 * globală a unui user (email/parolă) decât dacă acel user are deja acces
 * la firma lui — verificat mereu prin user_tenant_access, nu prin id gol.
 *
 * NU expune o cale de a acorda acces la firma curentă unui user EXISTENT
 * (alt cont, altă firmă) prin simpla cunoaștere a email-ului lui — asta ar
 * permite unui owner/admin să „importe" silențios, fără consimțământ, orice
 * cont deja înregistrat pe platformă în propria firmă (depășește scopul
 * documentat în docs/data-model.md, secțiunea „Multi-firmă": „un singur
 * user accesează mai multe tenanți pe care EL ÎNSUȘI îi administrează", nu
 * acces acordat unilateral de un tenant peste identitatea altcuiva). Un
 * user ajunge să acceseze mai multe firme azi doar prin rânduri de acces
 * create direct (seed/provisionare — la fel ca prima firmă a unui user, ce
 * nu are încă o API de auto-creare) — un flux self-service cu confirmare
 * din partea contului țintă (invitație) e de construit separat, doar la
 * cerere reală, nu speculativ acum.
 */
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Creează un user NOU (identitate globală + primul lui rând de acces, pe firma curentă). */
  async create(tenantId: string, dto: CreateUserDto): Promise<SafeUser> {
    const email = dto.email.trim().toLowerCase(); // aceeași normalizare ca AuthService
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const role = dto.role ?? 'operator';
    try {
      const user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: { email, passwordHash, fullName: dto.fullName },
        });
        await tx.userTenantAccess.create({
          data: { userId: created.id, tenantId, role },
        });
        return created;
      });
      return this.toSafeUser(user, { tenantId, role, isActive: true });
    } catch (err) {
      throw this.translateUniqueConstraint(err, email);
    }
  }

  async findAll(tenantId: string): Promise<SafeUser[]> {
    const rows = await this.prisma.userTenantAccess.findMany({
      where: { tenantId },
      include: { user: true },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((row) => this.toSafeUser(row.user, row));
  }

  async findOne(tenantId: string, id: string): Promise<SafeUser> {
    const row = await this.prisma.userTenantAccess.findFirst({
      where: { tenantId, userId: id },
      include: { user: true },
    });
    if (!row) {
      throw new NotFoundException(`Userul „${id}” nu există.`);
    }
    return this.toSafeUser(row.user, row);
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateUserDto,
    callerUserId: string,
  ): Promise<SafeUser> {
    // Tot blocul (citire rol curent + numărare alți owneri + scriere) într-
    // o singură tranzacție SERIALIZABLE — fix logic-reviewer: cu pașii
    // separați, două cereri concurente de dezactivare pe cei singuri 2
    // owneri activi ai unui tenant citeau amândouă „mai există 1 owner”,
    // treceau amândouă verificarea, și lăsau tenantul cu ZERO owneri
    // activi. Serializable face ca Postgres să respingă (P2034) tranzacția
    // care ar produce acest rezultat inconsistent — prinsă mai jos și
    // tradusă într-un 409 clar, de reîncercat. Regula, mutată de pe
    // `users` pe `user_tenant_access`, scopată pe tenantId (vezi
    // docs/data-model.md, secțiunea „Multi-firmă").
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const target = await tx.userTenantAccess.findFirst({
            where: { tenantId, userId: id },
          });
          if (!target) {
            throw new NotFoundException(`Userul „${id}” nu există.`);
          }

          // Promovarea la 'owner' — doar un owner poate crea alt owner (fix
          // logic-reviewer: fără asta, un 'admin' putea promova pe oricine,
          // inclusiv pe sine, la 'owner' — rolul de cea mai mare încredere,
          // documentat în docs/data-model.md — fără nicio verificare
          // suplimentară față de restul câmpurilor din UpdateUserDto).
          if (dto.role === 'owner' && target.role !== 'owner') {
            const caller = await tx.userTenantAccess.findFirst({
              where: { tenantId, userId: callerUserId },
            });
            if (caller?.role !== 'owner') {
              throw new ForbiddenException(
                'Doar un owner poate acorda rolul „owner” altui user.',
              );
            }
          }

          const losesOwnerStatus =
            target.role === 'owner' &&
            ((dto.role !== undefined && dto.role !== 'owner') ||
              dto.isActive === false);
          if (losesOwnerStatus) {
            const otherActiveOwners = await tx.userTenantAccess.count({
              where: {
                tenantId,
                role: 'owner',
                isActive: true,
                userId: { not: id },
              },
            });
            if (otherActiveOwners === 0) {
              throw new ConflictException(
                'Nu poți elimina rolul sau dezactiva ultimul owner activ al firmei.',
              );
            }
          }

          // fullName e identitate GLOBALĂ (users), nu proprietate a
          // accesului la firma curentă — scris separat de role/isActive.
          if (dto.fullName !== undefined) {
            await tx.user.update({
              where: { id },
              data: { fullName: dto.fullName },
            });
          }

          const accessData: Prisma.UserTenantAccessUpdateManyMutationInput = {};
          if (dto.role !== undefined) accessData.role = dto.role;
          if (dto.isActive !== undefined) accessData.isActive = dto.isActive;
          if (Object.keys(accessData).length > 0) {
            const { count } = await tx.userTenantAccess.updateMany({
              where: { tenantId, userId: id },
              data: accessData,
            });
            if (count === 0) {
              throw new NotFoundException(`Userul „${id}” nu există.`);
            }
          }

          const [user, access] = await Promise.all([
            tx.user.findFirstOrThrow({ where: { id } }),
            tx.userTenantAccess.findFirstOrThrow({
              where: { tenantId, userId: id },
            }),
          ]);
          return this.toSafeUser(user, access);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (err) {
      if (this.isPrismaError(err, 'P2034')) {
        throw new ConflictException(
          'Actualizare concurentă pe același user — reîncearcă.',
        );
      }
      throw err;
    }
  }

  async resetPassword(
    tenantId: string,
    id: string,
    newPassword: string,
  ): Promise<void> {
    // Parola e identitate GLOBALĂ (users), nedelimitată de tenant — de-asta
    // verificăm explicit accesul la firma curentă înainte de scriere,
    // altfel un owner/admin ar putea reseta parola oricărui user din
    // platformă doar ghicindu-i id-ul (breșă IDOR, regula #6 din
    // CLAUDE.md). Verificare + scriere în ACEEAȘI tranzacție (fix logic-
    // reviewer) — altfel un TOCTOU îngust: accesul revocat exact între
    // citire și scriere (alt owner dezactivează concurent userul) tot ar
    // lăsa reset-ul de parolă să treacă.
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.prisma.$transaction(async (tx) => {
      const access = await tx.userTenantAccess.findFirst({
        where: { tenantId, userId: id },
      });
      if (!access) {
        throw new NotFoundException(`Userul „${id}” nu există.`);
      }
      await tx.user.update({ where: { id }, data: { passwordHash } });
    });
  }

  async assignModuleRole(
    tenantId: string,
    userId: string,
    dto: AssignModuleRoleDto,
  ): Promise<UserModuleRole> {
    await this.findOne(tenantId, userId); // 404 dacă userul n-are acces la tenant
    try {
      return await this.prisma.userModuleRole.upsert({
        where: {
          tenantId_userId_moduleCode_role: {
            tenantId,
            userId,
            moduleCode: dto.moduleCode,
            role: dto.role,
          },
        },
        update: {}, // deja există — idempotent, nu re-datăm grantedAt
        create: {
          tenantId,
          userId,
          moduleCode: dto.moduleCode,
          role: dto.role,
        },
      });
    } catch (err) {
      throw this.translateModuleCodeForeignKey(err, dto.moduleCode);
    }
  }

  async revokeModuleRole(
    tenantId: string,
    userId: string,
    moduleCode: string,
    role: string,
  ): Promise<void> {
    const { count } = await this.prisma.userModuleRole.deleteMany({
      where: { tenantId, userId, moduleCode, role },
    });
    if (count === 0) {
      throw new NotFoundException(
        `Userul „${userId}” nu are rolul „${role}” pe modulul „${moduleCode}”.`,
      );
    }
  }

  async listModuleRoles(
    tenantId: string,
    userId: string,
  ): Promise<UserModuleRole[]> {
    await this.findOne(tenantId, userId); // 404 dacă userul n-are acces la tenant
    return this.prisma.userModuleRole.findMany({
      where: { tenantId, userId },
      orderBy: { grantedAt: 'asc' },
    });
  }

  private toSafeUser(user: User, access: AccessRow): SafeUser {
    return {
      id: user.id,
      tenantId: access.tenantId,
      email: user.email,
      fullName: user.fullName,
      role: access.role,
      isActive: access.isActive,
      createdAt: user.createdAt,
    };
  }

  private translateUniqueConstraint(err: unknown, email: string): Error {
    if (this.isPrismaError(err, 'P2002')) {
      return new ConflictException(
        `Există deja un user cu email „${email}” pe platformă.`,
      );
    }
    return err as Error;
  }

  private translateModuleCodeForeignKey(
    err: unknown,
    moduleCode: string,
  ): Error {
    if (this.isPrismaError(err, 'P2003')) {
      return new BadRequestException(`Modulul „${moduleCode}” nu există.`);
    }
    return err as Error;
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
