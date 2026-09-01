import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma, Task } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';

export type TaskWithAssignees = Task & {
  assignees: {
    userId: string;
    user: { id: string; fullName: string; email: string };
  }[];
};

const ASSIGNEE_INCLUDE = {
  assignees: {
    include: { user: { select: { id: true, fullName: true, email: true } } },
  },
} satisfies Prisma.TaskInclude;

/**
 * Sarcini (modul CRM, docs/crm-spec.md). Regula #6 din CLAUDE.md: fiecare
 * query filtrează explicit după tenantId — inclusiv verificarea legăturilor
 * opționale (company/contact/deal/assignees), care altfel ar fi o gaură
 * IDOR (FK-ul Prisma singur nu verifică tenant_id — vezi motivația din
 * DealsService.assertInvoiceBelongsToTenant / CompaniesService.assertUsersBelongToTenant).
 */
@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    tenantId: string,
    dto: CreateTaskDto,
  ): Promise<TaskWithAssignees> {
    await this.assertLinksBelongToTenant(tenantId, dto);
    return this.prisma.task.create({
      data: {
        tenantId,
        title: dto.title,
        description: dto.description,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
        priority: dto.priority ?? 'medium',
        status: dto.status ?? 'pending',
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

  async findAll(tenantId: string, q?: string): Promise<TaskWithAssignees[]> {
    return this.prisma.task.findMany({
      where: q
        ? { tenantId, title: { contains: q, mode: 'insensitive' } }
        : { tenantId },
      include: ASSIGNEE_INCLUDE,
      orderBy: { dueAt: 'asc' },
    });
  }

  async findOne(tenantId: string, id: string): Promise<TaskWithAssignees> {
    const task = await this.prisma.task.findFirst({
      where: { id, tenantId },
      include: ASSIGNEE_INCLUDE,
    });
    if (!task) {
      throw new NotFoundException(`Sarcina „${id}” nu există.`);
    }
    return task;
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateTaskDto,
  ): Promise<TaskWithAssignees> {
    await this.assertLinksBelongToTenant(tenantId, dto);
    const { assigneeUserIds, dueAt, ...rest } = dto;
    // `null` explicit golește termenul; `undefined` (cheie omisă) înseamnă
    // neschimbat — un simplu `dueAt ? new Date(dueAt) : undefined` ar
    // transforma greșit `null` tot în `undefined` (Prisma îl interpretează
    // ca „neschimbat”, nu ca „golește”), pierzând cererea de golire.
    const dueAtUpdate: { dueAt?: Date | null } =
      dueAt === undefined
        ? {}
        : { dueAt: dueAt === null ? null : new Date(dueAt) };

    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.task.updateMany({
        where: { id, tenantId },
        data: { ...rest, ...dueAtUpdate },
      });
      if (count === 0) {
        throw new NotFoundException(`Sarcina „${id}” nu există.`);
      }
      if (assigneeUserIds) {
        await tx.taskAssignee.deleteMany({ where: { taskId: id } });
        if (assigneeUserIds.length > 0) {
          await tx.taskAssignee.createMany({
            data: assigneeUserIds.map((userId) => ({ taskId: id, userId })),
          });
        }
      }
    });

    return this.findOne(tenantId, id);
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const { count } = await this.prisma.task.deleteMany({
      where: { id, tenantId },
    });
    if (count === 0) {
      throw new NotFoundException(`Sarcina „${id}” nu există.`);
    }
  }

  private async assertLinksBelongToTenant(
    tenantId: string,
    dto: CreateTaskDto | UpdateTaskDto,
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
