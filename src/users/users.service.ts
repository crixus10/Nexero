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

export type SafeUser = Omit<User, 'passwordHash'>;

/**
 * Management complet de useri (creare/listare/actualizare/dezactivare +
 * roluri per-modul), per decizia din sesiunea curentă — NU era încă
 * specificat în docs/ înainte de asta. Regula #6 din CLAUDE.md: fiecare
 * query filtrează explicit după tenantId — un owner/admin gestionează
 * DOAR userii propriei firme, niciodată cross-tenant.
 */
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, dto: CreateUserDto): Promise<SafeUser> {
    const email = dto.email.trim().toLowerCase(); // aceeași normalizare ca AuthService
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    try {
      const user = await this.prisma.user.create({
        data: {
          tenantId,
          email,
          passwordHash,
          fullName: dto.fullName,
          role: dto.role ?? 'operator',
        },
      });
      return this.omitPasswordHash(user);
    } catch (err) {
      throw this.translateUniqueConstraint(err, email);
    }
  }

  async findAll(tenantId: string): Promise<SafeUser[]> {
    const users = await this.prisma.user.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
    });
    return users.map((u) => this.omitPasswordHash(u));
  }

  async findOne(tenantId: string, id: string): Promise<SafeUser> {
    const user = await this.prisma.user.findFirst({ where: { id, tenantId } });
    if (!user) {
      throw new NotFoundException(`Userul „${id}” nu există.`);
    }
    return this.omitPasswordHash(user);
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateUserDto,
    callerUserId: string,
  ): Promise<SafeUser> {
    // Tot blocul (citire rol curent + numărare alți owneri + scriere) într-
    // o singură tranzacție SERIALIZABLE — fix logic-reviewer: cu pașii
    // separați (cum era înainte), două cereri concurente de dezactivare pe
    // cei singuri 2 owneri activi ai unui tenant citeau amândouă „mai
    // există 1 owner", treceau amândouă verificarea, și lăsau tenantul cu
    // ZERO owneri activi. Serializable face ca Postgres să respingă
    // (P2034) tranzacția care ar produce acest rezultat inconsistent —
    // prinsă mai jos și tradusă într-un 409 clar, de reîncercat.
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const target = await tx.user.findFirst({ where: { id, tenantId } });
          if (!target) {
            throw new NotFoundException(`Userul „${id}” nu există.`);
          }

          // Promovarea la 'owner' — doar un owner poate crea alt owner (fix
          // logic-reviewer: fără asta, un 'admin' putea promova pe oricine,
          // inclusiv pe sine, la 'owner' — rolul de cea mai mare încredere,
          // documentat în docs/data-model.md — fără nicio verificare
          // suplimentară față de restul câmpurilor din UpdateUserDto).
          if (dto.role === 'owner' && target.role !== 'owner') {
            const caller = await tx.user.findFirst({
              where: { id: callerUserId, tenantId },
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
            const otherActiveOwners = await tx.user.count({
              where: {
                tenantId,
                role: 'owner',
                isActive: true,
                id: { not: id },
              },
            });
            if (otherActiveOwners === 0) {
              throw new ConflictException(
                'Nu poți elimina rolul sau dezactiva ultimul owner activ al firmei.',
              );
            }
          }

          const { count } = await tx.user.updateMany({
            where: { id, tenantId },
            data: dto,
          });
          if (count === 0) {
            throw new NotFoundException(`Userul „${id}” nu există.`);
          }
          return this.omitPasswordHash(
            await tx.user.findFirstOrThrow({ where: { id, tenantId } }),
          );
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
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    const { count } = await this.prisma.user.updateMany({
      where: { id, tenantId },
      data: { passwordHash },
    });
    if (count === 0) {
      throw new NotFoundException(`Userul „${id}” nu există.`);
    }
  }

  async assignModuleRole(
    tenantId: string,
    userId: string,
    dto: AssignModuleRoleDto,
  ): Promise<UserModuleRole> {
    await this.findOne(tenantId, userId); // 404 dacă userul nu există în tenant
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
    await this.findOne(tenantId, userId); // 404 dacă userul nu există în tenant
    return this.prisma.userModuleRole.findMany({
      where: { tenantId, userId },
      orderBy: { grantedAt: 'asc' },
    });
  }

  private omitPasswordHash(user: User): SafeUser {
    return {
      id: user.id,
      tenantId: user.tenantId,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
    };
  }

  private translateUniqueConstraint(err: unknown, email: string): Error {
    if (this.isPrismaError(err, 'P2002')) {
      return new ConflictException(`Există deja un user cu email „${email}”.`);
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
