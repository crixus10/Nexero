import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { CodeSequenceService } from '../../../common/code-sequence.service';
import type { AnafService } from '../../../integrations/anaf/anaf.service';
import type { PrismaService } from '../../../prisma/prisma.service';
import { CompaniesService } from './companies.service';
import type { CreateCompanyDto } from './dto/create-company.dto';

describe('CompaniesService', () => {
  const tenantId = 'tenant-1';
  let prisma: {
    company: {
      create: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      updateMany: jest.Mock;
      deleteMany: jest.Mock;
    };
    companyTeamMember: { deleteMany: jest.Mock; createMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let anaf: { validateCui: jest.Mock; normalizeCuiUnverified: jest.Mock };
  let codeSequence: { nextFormatted: jest.Mock };
  let service: CompaniesService;

  beforeEach(() => {
    prisma = {
      company: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        updateMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      companyTeamMember: { deleteMany: jest.fn(), createMany: jest.fn() },
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn(prisma),
      ),
    };
    anaf = {
      validateCui: jest.fn(),
      normalizeCuiUnverified: jest.fn((raw: string) => raw.replace(/^RO/i, '')),
    };
    codeSequence = { nextFormatted: jest.fn().mockResolvedValue('CLI-0001') };
    service = new CompaniesService(
      prisma as unknown as PrismaService,
      anaf as unknown as AnafService,
      codeSequence as unknown as CodeSequenceService,
    );
  });

  it('alocă automat companyCode prin CodeSequenceService, niciodată din input', async () => {
    let createData: Record<string, unknown> | undefined;
    prisma.company.create.mockImplementation(
      (args: { data: Record<string, unknown> }) => {
        createData = args.data;
        return Promise.resolve({ id: 'c1' });
      },
    );

    const dto = { name: 'Firma X' } as CreateCompanyDto;
    await service.create(tenantId, dto);

    expect(codeSequence.nextFormatted).toHaveBeenCalledWith(
      tenantId,
      'company',
      'CLI',
    );
    expect(createData).toMatchObject({ tenantId, companyCode: 'CLI-0001' });
  });

  it('validează CUI (cod fiscal) prin AnafService înainte de a crea compania', async () => {
    anaf.validateCui.mockResolvedValue({
      cui: '12345678',
      isVatPayer: true,
      name: 'Firma X',
      address: null,
    });
    let createData: Record<string, unknown> | undefined;
    prisma.company.create.mockImplementation(
      (args: { data: Record<string, unknown> }) => {
        createData = args.data;
        return Promise.resolve({ id: 'c1' });
      },
    );

    const dto: CreateCompanyDto = { name: 'Firma X', taxId: 'RO12345678' };
    await service.create(tenantId, dto);

    expect(anaf.validateCui).toHaveBeenCalledWith('RO12345678');
    expect(createData).toMatchObject({ tenantId, taxId: '12345678' });
  });

  it('acceptă CUI-ul introdus manual, neverificat, dacă ANAF e indisponibil (cerință explicită utilizator)', async () => {
    anaf.validateCui.mockRejectedValue(
      new ServiceUnavailableException('ANAF picat'),
    );
    let createData: Record<string, unknown> | undefined;
    prisma.company.create.mockImplementation(
      (args: { data: Record<string, unknown> }) => {
        createData = args.data;
        return Promise.resolve({ id: 'c1' });
      },
    );

    const dto: CreateCompanyDto = { name: 'Firma X', taxId: 'RO12345678' };
    await service.create(tenantId, dto);

    expect(anaf.normalizeCuiUnverified).toHaveBeenCalledWith('RO12345678');
    // isVatPayer rămâne implicit true — nu avem sursă autoritativă ANAF acum.
    expect(createData).toMatchObject({
      tenantId,
      taxId: '12345678',
      isVatPayer: true,
    });
  });

  it('respinge un CUI cu format invalid chiar dacă ANAF ar fi disponibil (nu ocolește erori reale de validare)', async () => {
    anaf.validateCui.mockRejectedValue(new BadRequestException('CUI invalid'));

    const dto: CreateCompanyDto = { name: 'Firma X', taxId: 'abc' };
    await expect(service.create(tenantId, dto)).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.company.create).not.toHaveBeenCalled();
    expect(anaf.normalizeCuiUnverified).not.toHaveBeenCalled();
  });

  it('update acceptă CUI-ul introdus manual, neverificat, dacă ANAF e indisponibil', async () => {
    anaf.validateCui.mockRejectedValue(
      new ServiceUnavailableException('ANAF picat'),
    );
    let updateData: Record<string, unknown> | undefined;
    prisma.company.updateMany.mockImplementation(
      (args: { data: Record<string, unknown> }) => {
        updateData = args.data;
        return Promise.resolve({ count: 1 });
      },
    );
    prisma.company.findFirst.mockResolvedValue({ id: 'c1' });

    await service.update(tenantId, 'c1', { taxId: 'RO87654321' });

    expect(anaf.normalizeCuiUnverified).toHaveBeenCalledWith('RO87654321');
    expect(updateData).toMatchObject({ taxId: '87654321' });
  });

  it('nu apelează ANAF pentru o companie fără taxId (lead)', async () => {
    prisma.company.create.mockResolvedValue({ id: 'c1' });

    const dto: CreateCompanyDto = { name: 'Lead SRL' };
    await service.create(tenantId, dto);

    expect(anaf.validateCui).not.toHaveBeenCalled();
  });

  it('traduce coliziunea de companyCode într-un ConflictException', async () => {
    prisma.company.create.mockRejectedValue({ code: 'P2002' });

    const dto: CreateCompanyDto = { name: 'Firma X' };
    await expect(service.create(tenantId, dto)).rejects.toThrow(
      ConflictException,
    );
  });

  it('findOne aruncă NotFoundException dacă nu găsește compania în tenant', async () => {
    prisma.company.findFirst.mockResolvedValue(null);

    await expect(service.findOne(tenantId, 'missing')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('findAll caută case-insensitive pe name și companyCode când q e dat', async () => {
    prisma.company.findMany.mockResolvedValue([]);

    await service.findAll(tenantId, 'firma');

    expect(prisma.company.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId,
          OR: [
            { name: { contains: 'firma', mode: 'insensitive' } },
            { companyCode: { contains: 'firma', mode: 'insensitive' } },
          ],
        },
      }),
    );
  });

  it('update filtrează explicit după tenantId (regula #6) și dă 404 dacă nu potrivește', async () => {
    prisma.company.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.update(tenantId, 'id-din-alt-tenant', { name: 'Nou' }),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.company.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'id-din-alt-tenant', tenantId } }),
    );
  });

  it('remove traduce o încălcare de FK (companie folosită pe o factură) într-un ConflictException', async () => {
    prisma.company.deleteMany.mockRejectedValue({ code: 'P2003' });

    await expect(service.remove(tenantId, 'c1')).rejects.toThrow(
      ConflictException,
    );
  });

  it('remove șterge o companie neutilizată fără erori', async () => {
    prisma.company.deleteMany.mockResolvedValue({ count: 1 });

    await expect(service.remove(tenantId, 'c1')).resolves.toBeUndefined();
  });
});
