import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../../prisma/prisma.service';
import type { CreateTaskDto } from './dto/create-task.dto';
import { TasksService } from './tasks.service';

describe('TasksService', () => {
  const tenantId = 'tenant-1';
  let prisma: {
    task: {
      create: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      updateMany: jest.Mock;
      deleteMany: jest.Mock;
    };
    company: { count: jest.Mock };
    contact: { count: jest.Mock };
    deal: { count: jest.Mock };
    userTenantAccess: { count: jest.Mock };
    $transaction: jest.Mock;
  };
  let service: TasksService;

  beforeEach(() => {
    prisma = {
      task: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        updateMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      company: { count: jest.fn() },
      contact: { count: jest.fn() },
      deal: { count: jest.fn() },
      userTenantAccess: { count: jest.fn() },
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn(prisma),
      ),
    };
    service = new TasksService(prisma as unknown as PrismaService);
  });

  it('respinge un companyId care nu aparține tenantului (protecție IDOR)', async () => {
    prisma.company.count.mockResolvedValue(0);

    const dto: CreateTaskDto = { title: 'Task', companyId: 'alta-firma' };
    await expect(service.create(tenantId, dto)).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.task.create).not.toHaveBeenCalled();
  });

  it('respinge un assigneeUserIds cu un user din altă firmă', async () => {
    prisma.userTenantAccess.count.mockResolvedValue(1); // doar 1 din 2 aparține tenantului

    const dto: CreateTaskDto = {
      title: 'Task',
      assigneeUserIds: ['u1', 'u2'],
    };
    await expect(service.create(tenantId, dto)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('creează sarcina când toate legăturile aparțin tenantului', async () => {
    prisma.company.count.mockResolvedValue(1);
    prisma.userTenantAccess.count.mockResolvedValue(1);
    prisma.task.create.mockResolvedValue({ id: 't1' });

    const dto: CreateTaskDto = {
      title: 'Task',
      companyId: 'c1',
      assigneeUserIds: ['u1'],
    };
    await service.create(tenantId, dto);

    expect(prisma.task.create).toHaveBeenCalled();
  });

  it('findOne aruncă NotFoundException dacă nu găsește sarcina în tenant', async () => {
    prisma.task.findFirst.mockResolvedValue(null);

    await expect(service.findOne(tenantId, 'missing')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('update filtrează explicit după tenantId (regula #6) și dă 404 dacă nu potrivește', async () => {
    prisma.task.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.update(tenantId, 'id-din-alt-tenant', { title: 'Nou' }),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.task.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'id-din-alt-tenant', tenantId } }),
    );
  });

  it('remove dă 404 dacă nu găsește sarcina în tenant', async () => {
    prisma.task.deleteMany.mockResolvedValue({ count: 0 });

    await expect(service.remove(tenantId, 'missing')).rejects.toThrow(
      NotFoundException,
    );
  });
});
