import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { CodeSequenceService } from '../../../common/code-sequence.service';
import type { PrismaService } from '../../../prisma/prisma.service';
import { ContactsService } from './contacts.service';
import type { CreateContactDto } from './dto/create-contact.dto';

describe('ContactsService', () => {
  const tenantId = 'tenant-1';
  let prisma: {
    contact: {
      create: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      updateMany: jest.Mock;
      deleteMany: jest.Mock;
    };
    company: { count: jest.Mock };
  };
  let codeSequence: { nextFormatted: jest.Mock };
  let service: ContactsService;

  beforeEach(() => {
    prisma = {
      contact: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        updateMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      company: { count: jest.fn().mockResolvedValue(1) },
    };
    codeSequence = { nextFormatted: jest.fn().mockResolvedValue('CTC-0001') };
    service = new ContactsService(
      prisma as unknown as PrismaService,
      codeSequence as unknown as CodeSequenceService,
    );
  });

  it('alocă automat contactCode prin CodeSequenceService', async () => {
    let createData: Record<string, unknown> | undefined;
    prisma.contact.create.mockImplementation(
      (args: { data: Record<string, unknown> }) => {
        createData = args.data;
        return Promise.resolve({ id: 'ct1' });
      },
    );

    const dto: CreateContactDto = { name: 'Ion Popescu' };
    await service.create(tenantId, dto);

    expect(codeSequence.nextFormatted).toHaveBeenCalledWith(
      tenantId,
      'contact',
      'CTC',
    );
    expect(createData).toMatchObject({ tenantId, contactCode: 'CTC-0001' });
  });

  it('respinge o companyId care nu aparține tenantului (protecție IDOR)', async () => {
    prisma.company.count.mockResolvedValue(0);

    const dto: CreateContactDto = {
      name: 'Ion Popescu',
      companyId: 'alta-firma',
    };
    await expect(service.create(tenantId, dto)).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.company.count).toHaveBeenCalledWith({
      where: { id: 'alta-firma', tenantId },
    });
    expect(prisma.contact.create).not.toHaveBeenCalled();
  });

  it('traduce o eroare P2003 la insert (companie ștearsă chiar înainte de scriere) într-un ConflictException', async () => {
    prisma.contact.create.mockRejectedValue({ code: 'P2003' });

    const dto: CreateContactDto = {
      name: 'Ion Popescu',
      companyId: 'c1',
    };
    await expect(service.create(tenantId, dto)).rejects.toThrow(
      ConflictException,
    );
  });

  it('findOne aruncă NotFoundException dacă nu găsește contactul în tenant', async () => {
    prisma.contact.findFirst.mockResolvedValue(null);

    await expect(service.findOne(tenantId, 'missing')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('update filtrează explicit după tenantId (regula #6) și dă 404 dacă nu potrivește', async () => {
    prisma.contact.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.update(tenantId, 'id-din-alt-tenant', { name: 'Nou' }),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.contact.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'id-din-alt-tenant', tenantId } }),
    );
  });

  it('update respinge o companyId care nu aparține tenantului (protecție IDOR)', async () => {
    prisma.company.count.mockResolvedValue(0);

    await expect(
      service.update(tenantId, 'ct1', { companyId: 'alta-firma' }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.contact.updateMany).not.toHaveBeenCalled();
  });

  it('remove nu e blocat de FK (deals/tasks/notes.contact_id sunt SET NULL)', async () => {
    prisma.contact.deleteMany.mockResolvedValue({ count: 1 });

    await expect(service.remove(tenantId, 'ct1')).resolves.toBeUndefined();
  });

  it('remove dă 404 dacă nu găsește contactul în tenant', async () => {
    prisma.contact.deleteMany.mockResolvedValue({ count: 0 });

    await expect(service.remove(tenantId, 'missing')).rejects.toThrow(
      NotFoundException,
    );
  });
});
