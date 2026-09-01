import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../../prisma/prisma.service';
import type { CreateNoteDto } from './dto/create-note.dto';
import { NotesService } from './notes.service';

describe('NotesService', () => {
  const tenantId = 'tenant-1';
  let prisma: {
    note: {
      create: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      updateMany: jest.Mock;
      deleteMany: jest.Mock;
    };
    company: { count: jest.Mock };
    contact: { count: jest.Mock };
    deal: { count: jest.Mock };
    user: { count: jest.Mock };
    $transaction: jest.Mock;
  };
  let service: NotesService;

  beforeEach(() => {
    prisma = {
      note: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        updateMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      company: { count: jest.fn() },
      contact: { count: jest.fn() },
      deal: { count: jest.fn() },
      user: { count: jest.fn() },
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn(prisma),
      ),
    };
    service = new NotesService(prisma as unknown as PrismaService);
  });

  it('respinge un dealId care nu aparține tenantului (protecție IDOR)', async () => {
    prisma.deal.count.mockResolvedValue(0);

    const dto: CreateNoteDto = { title: 'Notă', dealId: 'alta-firma' };
    await expect(service.create(tenantId, dto)).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.note.create).not.toHaveBeenCalled();
  });

  it('creează nota implicit ca isFavorite: false', async () => {
    let createData: Record<string, unknown> | undefined;
    prisma.note.create.mockImplementation(
      (args: { data: Record<string, unknown> }) => {
        createData = args.data;
        return Promise.resolve({ id: 'n1' });
      },
    );

    await service.create(tenantId, { title: 'Notă' });

    expect(createData).toMatchObject({
      isFavorite: false,
      priority: 'medium',
      status: 'pending',
    });
  });

  it('findOne aruncă NotFoundException dacă nu găsește nota în tenant', async () => {
    prisma.note.findFirst.mockResolvedValue(null);

    await expect(service.findOne(tenantId, 'missing')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('update filtrează explicit după tenantId (regula #6) și dă 404 dacă nu potrivește', async () => {
    prisma.note.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.update(tenantId, 'id-din-alt-tenant', { title: 'Nou' }),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.note.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'id-din-alt-tenant', tenantId } }),
    );
  });

  it('remove dă 404 dacă nu găsește nota în tenant', async () => {
    prisma.note.deleteMany.mockResolvedValue({ count: 0 });

    await expect(service.remove(tenantId, 'missing')).rejects.toThrow(
      NotFoundException,
    );
  });
});
