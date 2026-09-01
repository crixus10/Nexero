import { ConflictException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../../prisma/prisma.service';
import type { CreateInvoiceSeriesDto } from './dto/create-invoice-series.dto';
import { InvoiceSeriesService } from './invoice-series.service';

describe('InvoiceSeriesService', () => {
  const tenantId = 'tenant-1';
  let prisma: {
    invoiceSeries: {
      create: jest.Mock;
      findMany: jest.Mock;
      deleteMany: jest.Mock;
    };
  };
  let service: InvoiceSeriesService;

  beforeEach(() => {
    prisma = {
      invoiceSeries: {
        create: jest.fn(),
        findMany: jest.fn(),
        deleteMany: jest.fn(),
      },
    };
    service = new InvoiceSeriesService(prisma as unknown as PrismaService);
  });

  it('traduce coliziunea de seriesCode într-un ConflictException', async () => {
    prisma.invoiceSeries.create.mockRejectedValue({ code: 'P2002' });

    const dto: CreateInvoiceSeriesDto = {
      seriesCode: 'FACT',
      documentType: 'invoice',
    };
    await expect(service.create(tenantId, dto)).rejects.toThrow(
      ConflictException,
    );
  });

  it('findAll caută case-insensitive pe seriesCode când q e dat', async () => {
    prisma.invoiceSeries.findMany.mockResolvedValue([]);

    await service.findAll(tenantId, 'fact');

    expect(prisma.invoiceSeries.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId,
          seriesCode: { contains: 'fact', mode: 'insensitive' },
        },
      }),
    );
  });

  it('findAll filtrează doar după tenantId când q lipsește', async () => {
    prisma.invoiceSeries.findMany.mockResolvedValue([]);

    await service.findAll(tenantId);

    expect(prisma.invoiceSeries.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId } }),
    );
  });

  it('remove filtrează explicit după tenantId (regula #6) și dă 404 dacă nu potrivește', async () => {
    prisma.invoiceSeries.deleteMany.mockResolvedValue({ count: 0 });

    await expect(service.remove(tenantId, 'id-din-alt-tenant')).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.invoiceSeries.deleteMany).toHaveBeenCalledWith({
      where: { id: 'id-din-alt-tenant', tenantId },
    });
  });

  it('remove traduce o încălcare de FK (serie folosită pe o factură) într-un ConflictException', async () => {
    prisma.invoiceSeries.deleteMany.mockRejectedValue({ code: 'P2003' });

    await expect(service.remove(tenantId, 's1')).rejects.toThrow(
      ConflictException,
    );
  });

  it('remove șterge o serie neutilizată fără erori', async () => {
    prisma.invoiceSeries.deleteMany.mockResolvedValue({ count: 1 });

    await expect(service.remove(tenantId, 's1')).resolves.toBeUndefined();
  });
});
