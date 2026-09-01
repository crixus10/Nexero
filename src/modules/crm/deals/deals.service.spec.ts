import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { CodeSequenceService } from '../../../common/code-sequence.service';
import type { PrismaService } from '../../../prisma/prisma.service';
import { DealsService } from './deals.service';
import type { CreateDealDto } from './dto/create-deal.dto';

describe('DealsService', () => {
  const tenantId = 'tenant-1';
  let prisma: {
    deal: {
      create: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      updateMany: jest.Mock;
      deleteMany: jest.Mock;
    };
    invoice: { findFirst: jest.Mock };
    contact: { count: jest.Mock };
    company: { count: jest.Mock };
  };
  let codeSequence: { nextFormatted: jest.Mock };
  let service: DealsService;

  beforeEach(() => {
    prisma = {
      deal: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        updateMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      invoice: { findFirst: jest.fn() },
      contact: { count: jest.fn().mockResolvedValue(1) },
      company: { count: jest.fn().mockResolvedValue(1) },
    };
    codeSequence = {
      nextFormatted: jest.fn().mockResolvedValue('DEAL-2026-0001'),
    };
    service = new DealsService(
      prisma as unknown as PrismaService,
      codeSequence as unknown as CodeSequenceService,
    );
  });

  it('alocă dealCode dintr-o secvență per an (deal:{an})', async () => {
    prisma.deal.create.mockResolvedValue({ id: 'd1' });

    const dto: CreateDealDto = {
      title: 'Contract mentenanță',
      totalValue: 5000,
      dealDate: '2026-03-01',
    };
    await service.create(tenantId, dto);

    expect(codeSequence.nextFormatted).toHaveBeenCalledWith(
      tenantId,
      'deal:2026',
      'DEAL-2026',
    );
  });

  it('respinge un invoiceId care nu aparține tenantului (protecție IDOR)', async () => {
    prisma.invoice.findFirst.mockResolvedValue(null);

    const dto: CreateDealDto = {
      title: 'Deal legat de factură străină',
      totalValue: 1000,
      dealDate: '2026-03-01',
      invoiceId: 'inv-altui-tenant',
    };
    await expect(service.create(tenantId, dto)).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.invoice.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'inv-altui-tenant', tenantId } }),
    );
    expect(prisma.deal.create).not.toHaveBeenCalled();
  });

  it('acceptă un invoiceId real, din același tenant', async () => {
    prisma.invoice.findFirst.mockResolvedValue({ id: 'inv-1' });
    prisma.deal.create.mockResolvedValue({ id: 'd1' });

    const dto: CreateDealDto = {
      title: 'Deal legat de factură reală',
      totalValue: 1000,
      dealDate: '2026-03-01',
      invoiceId: 'inv-1',
    };
    await service.create(tenantId, dto);

    expect(prisma.deal.create).toHaveBeenCalled();
  });

  it('respinge un contactId care nu aparține tenantului (protecție IDOR)', async () => {
    prisma.contact.count.mockResolvedValue(0);

    const dto: CreateDealDto = {
      title: 'Deal legat de contact străin',
      totalValue: 1000,
      dealDate: '2026-03-01',
      contactId: 'alta-firma',
    };
    await expect(service.create(tenantId, dto)).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.deal.create).not.toHaveBeenCalled();
  });

  it('respinge o companyId care nu aparține tenantului (protecție IDOR)', async () => {
    prisma.company.count.mockResolvedValue(0);

    const dto: CreateDealDto = {
      title: 'Deal legat de companie străină',
      totalValue: 1000,
      dealDate: '2026-03-01',
      companyId: 'alta-firma',
    };
    await expect(service.create(tenantId, dto)).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.deal.create).not.toHaveBeenCalled();
  });

  it('update respinge un contactId/companyId care nu aparțin tenantului (protecție IDOR)', async () => {
    prisma.contact.count.mockResolvedValue(0);

    await expect(
      service.update(tenantId, 'd1', { contactId: 'alta-firma' }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.deal.updateMany).not.toHaveBeenCalled();
  });

  it('findOne aruncă NotFoundException dacă nu găsește deal-ul în tenant', async () => {
    prisma.deal.findFirst.mockResolvedValue(null);

    await expect(service.findOne(tenantId, 'missing')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('update filtrează explicit după tenantId (regula #6) și dă 404 dacă nu potrivește', async () => {
    prisma.deal.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.update(tenantId, 'id-din-alt-tenant', { title: 'Nou' }),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.deal.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'id-din-alt-tenant', tenantId } }),
    );
  });

  it('remove dă 404 dacă nu găsește deal-ul în tenant', async () => {
    prisma.deal.deleteMany.mockResolvedValue({ count: 0 });

    await expect(service.remove(tenantId, 'missing')).rejects.toThrow(
      NotFoundException,
    );
  });
});
