import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

describe('UsersService', () => {
  const tenantId = 'tenant-1';
  let prisma: {
    user: {
      create: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      findFirstOrThrow: jest.Mock;
      updateMany: jest.Mock;
      count: jest.Mock;
    };
    userModuleRole: {
      upsert: jest.Mock;
      deleteMany: jest.Mock;
      findMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let service: UsersService;

  beforeEach(() => {
    prisma = {
      user: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findFirstOrThrow: jest.fn(),
        updateMany: jest.fn(),
        count: jest.fn(),
      },
      userModuleRole: {
        upsert: jest.fn(),
        deleteMany: jest.fn(),
        findMany: jest.fn(),
      },
      // update() rulează într-o tranzacție — tx primește aceleași mock-uri
      // ca prisma direct (aceeași instanță `prisma.user`), suficient pentru
      // testele de mai jos, care nu au nevoie de izolare reală de tranzacție.
      $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(prisma)),
    };
    service = new UsersService(prisma as unknown as PrismaService);
  });

  it('create omite passwordHash din răspuns și normalizează email-ul', async () => {
    // Captăm argumentul din mockImplementation (tipat explicit), nu din
    // .mock.calls[0][0] — vezi comentariul echivalent din
    // customers.service.spec.ts (@typescript-eslint/no-unsafe-member-access
    // pe un jest.Mock fără generice).
    let createData: Record<string, unknown> | undefined;
    prisma.user.create.mockImplementation(
      (args: { data: Record<string, unknown> }) => {
        createData = args.data;
        return Promise.resolve({
          id: 'u1',
          tenantId,
          email: 'a@b.ro',
          passwordHash: 'secret-hash',
          fullName: 'A B',
          role: 'operator',
          isActive: true,
          createdAt: new Date(),
        });
      },
    );

    const result = await service.create(tenantId, {
      email: 'A@B.ro',
      password: 'parola123',
      fullName: 'A B',
    });

    expect(result).not.toHaveProperty('passwordHash');
    expect(createData).toMatchObject({ tenantId, email: 'a@b.ro' });
  });

  it('traduce coliziunea de email într-un ConflictException', async () => {
    prisma.user.create.mockRejectedValue({ code: 'P2002' });
    await expect(
      service.create(tenantId, {
        email: 'a@b.ro',
        password: 'parola123',
        fullName: 'A B',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('findOne aruncă NotFoundException dacă nu găsește userul în tenant', async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    await expect(service.findOne(tenantId, 'missing')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('update blochează retrogradarea ultimului owner activ', async () => {
    prisma.user.findFirst.mockResolvedValue({
      id: 'u1',
      tenantId,
      role: 'owner',
      isActive: true,
    });
    prisma.user.count.mockResolvedValue(0); // niciun alt owner activ

    await expect(
      service.update(tenantId, 'u1', { role: 'operator' }, 'caller-1'),
    ).rejects.toThrow(ConflictException);
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });

  it('update permite retrogradarea unui owner dacă mai există alt owner activ', async () => {
    prisma.user.findFirst.mockResolvedValue({
      id: 'u1',
      tenantId,
      role: 'owner',
      isActive: true,
    });
    prisma.user.count.mockResolvedValue(1); // mai există un owner
    prisma.user.updateMany.mockResolvedValue({ count: 1 });
    prisma.user.findFirstOrThrow.mockResolvedValue({
      id: 'u1',
      tenantId,
      role: 'operator',
      isActive: true,
      email: 'a@b.ro',
      fullName: 'A',
      createdAt: new Date(),
      passwordHash: 'x',
    });

    const result = await service.update(
      tenantId,
      'u1',
      { role: 'operator' },
      'caller-1',
    );
    expect(result.role).toBe('operator');
    expect(prisma.user.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'u1', tenantId } }),
    );
  });

  it('update respinge promovarea la "owner" de către un caller care nu e el însuși owner (fix logic-reviewer)', async () => {
    // target (operator) → primul findFirst; caller (admin, NU owner) → al
    // doilea findFirst.
    prisma.user.findFirst.mockResolvedValueOnce({
      id: 'u1',
      tenantId,
      role: 'operator',
      isActive: true,
    });
    prisma.user.findFirst.mockResolvedValueOnce({
      id: 'caller-1',
      tenantId,
      role: 'admin',
      isActive: true,
    });

    await expect(
      service.update(tenantId, 'u1', { role: 'owner' }, 'caller-1'),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });

  it('update permite promovarea la "owner" dacă apelantul e el însuși owner', async () => {
    prisma.user.findFirst.mockResolvedValueOnce({
      id: 'u1',
      tenantId,
      role: 'operator',
      isActive: true,
    });
    prisma.user.findFirst.mockResolvedValueOnce({
      id: 'caller-1',
      tenantId,
      role: 'owner',
      isActive: true,
    });
    prisma.user.updateMany.mockResolvedValue({ count: 1 });
    prisma.user.findFirstOrThrow.mockResolvedValue({
      id: 'u1',
      tenantId,
      role: 'owner',
      isActive: true,
      email: 'a@b.ro',
      fullName: 'A',
      createdAt: new Date(),
      passwordHash: 'x',
    });

    const result = await service.update(
      tenantId,
      'u1',
      { role: 'owner' },
      'caller-1',
    );
    expect(result.role).toBe('owner');
  });

  it('update traduce un conflict de serializare (P2034 — cursă concurentă) într-un ConflictException', async () => {
    prisma.$transaction.mockRejectedValue({ code: 'P2034' });
    await expect(
      service.update(tenantId, 'u1', { fullName: 'Nou' }, 'caller-1'),
    ).rejects.toThrow(ConflictException);
  });

  it('update filtrează explicit după tenantId (regula #6) și dă 404 dacă nu potrivește', async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    await expect(
      service.update(
        tenantId,
        'id-din-alt-tenant',
        { fullName: 'Nou' },
        'caller-1',
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('assignModuleRole traduce FK invalid (modul inexistent) într-un BadRequestException', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'u1', tenantId });
    prisma.userModuleRole.upsert.mockRejectedValue({ code: 'P2003' });

    await expect(
      service.assignModuleRole(tenantId, 'u1', {
        moduleCode: 'modul-inexistent',
        role: 'x:y',
      }),
    ).rejects.toThrow('Modulul „modul-inexistent” nu există.');
  });

  it('revokeModuleRole aruncă NotFoundException dacă nu exista rolul', async () => {
    prisma.userModuleRole.deleteMany.mockResolvedValue({ count: 0 });
    await expect(
      service.revokeModuleRole(tenantId, 'u1', 'invoicing', 'invoicing:issuer'),
    ).rejects.toThrow(NotFoundException);
  });
});
