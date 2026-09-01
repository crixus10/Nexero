import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Note, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateNoteDto } from './dto/create-note.dto';
import { UpdateNoteDto } from './dto/update-note.dto';

export type NoteWithAssignees = Note & {
  assignees: {
    userId: string;
    user: { id: string; fullName: string; email: string };
  }[];
};

const ASSIGNEE_INCLUDE = {
  assignees: {
    include: { user: { select: { id: true, fullName: true, email: true } } },
  },
} satisfies Prisma.NoteInclude;

/**
 * Note (modul CRM, docs/crm-spec.md) — aceeași structură ca TasksService,
 * inclusiv gărzile IDOR pe legăturile opționale (regula #6 CLAUDE.md).
 */
@Injectable()
export class NotesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    tenantId: string,
    dto: CreateNoteDto,
  ): Promise<NoteWithAssignees> {
    await this.assertLinksBelongToTenant(tenantId, dto);
    return this.prisma.note.create({
      data: {
        tenantId,
        title: dto.title,
        content: dto.content,
        category: dto.category,
        priority: dto.priority ?? 'medium',
        status: dto.status ?? 'pending',
        dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
        isFavorite: dto.isFavorite ?? false,
        companyId: dto.companyId,
        contactId: dto.contactId,
        dealId: dto.dealId,
        assignees: dto.assigneeUserIds
          ? { create: dto.assigneeUserIds.map((userId) => ({ userId })) }
          : undefined,
      },
      include: ASSIGNEE_INCLUDE,
    });
  }

  async findAll(tenantId: string, q?: string): Promise<NoteWithAssignees[]> {
    return this.prisma.note.findMany({
      where: q
        ? { tenantId, title: { contains: q, mode: 'insensitive' } }
        : { tenantId },
      include: ASSIGNEE_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(tenantId: string, id: string): Promise<NoteWithAssignees> {
    const note = await this.prisma.note.findFirst({
      where: { id, tenantId },
      include: ASSIGNEE_INCLUDE,
    });
    if (!note) {
      throw new NotFoundException(`Nota „${id}” nu există.`);
    }
    return note;
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateNoteDto,
  ): Promise<NoteWithAssignees> {
    await this.assertLinksBelongToTenant(tenantId, dto);
    const { assigneeUserIds, dueAt, ...rest } = dto;
    // Vezi comentariul echivalent din TasksService.update — `null` explicit
    // golește termenul, `undefined` (cheie omisă) înseamnă neschimbat.
    const dueAtUpdate: { dueAt?: Date | null } =
      dueAt === undefined
        ? {}
        : { dueAt: dueAt === null ? null : new Date(dueAt) };

    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.note.updateMany({
        where: { id, tenantId },
        data: { ...rest, ...dueAtUpdate },
      });
      if (count === 0) {
        throw new NotFoundException(`Nota „${id}” nu există.`);
      }
      if (assigneeUserIds) {
        await tx.noteAssignee.deleteMany({ where: { noteId: id } });
        if (assigneeUserIds.length > 0) {
          await tx.noteAssignee.createMany({
            data: assigneeUserIds.map((userId) => ({ noteId: id, userId })),
          });
        }
      }
    });

    return this.findOne(tenantId, id);
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const { count } = await this.prisma.note.deleteMany({
      where: { id, tenantId },
    });
    if (count === 0) {
      throw new NotFoundException(`Nota „${id}” nu există.`);
    }
  }

  private async assertLinksBelongToTenant(
    tenantId: string,
    dto: CreateNoteDto | UpdateNoteDto,
  ): Promise<void> {
    if (dto.companyId) {
      const c = await this.prisma.company.count({
        where: { id: dto.companyId, tenantId },
      });
      if (c === 0)
        throw new BadRequestException(
          'companyId invalid pentru această firmă.',
        );
    }
    if (dto.contactId) {
      const c = await this.prisma.contact.count({
        where: { id: dto.contactId, tenantId },
      });
      if (c === 0)
        throw new BadRequestException(
          'contactId invalid pentru această firmă.',
        );
    }
    if (dto.dealId) {
      const c = await this.prisma.deal.count({
        where: { id: dto.dealId, tenantId },
      });
      if (c === 0)
        throw new BadRequestException('dealId invalid pentru această firmă.');
    }
    if (dto.assigneeUserIds && dto.assigneeUserIds.length > 0) {
      const c = await this.prisma.user.count({
        where: { id: { in: dto.assigneeUserIds }, tenantId },
      });
      if (c !== dto.assigneeUserIds.length) {
        throw new BadRequestException(
          'Unul sau mai mulți useri din assigneeUserIds nu aparțin acestei firme.',
        );
      }
    }
  }
}
