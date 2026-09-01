import { ConflictException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../../prisma/prisma.service';
import type { CreateProductDto } from './dto/create-product.dto';
import { ProductsService } from './products.service';

describe('ProductsService', () => {
  const tenantId = 'tenant-1';
  let prisma: {
    product: {
      create: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      updateMany: jest.Mock;
      deleteMany: jest.Mock;
    };
  };
  let service: ProductsService;

  beforeEach(() => {
    prisma = {
      product: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        updateMany: jest.fn(),
        deleteMany: jest.fn(),
      },
    };
    service = new ProductsService(prisma as unknown as PrismaService);
  });

  it('scrie revenueAccount exact cum e dat, fără fallback silențios', async () => {
    // revenueAccount e OBLIGATORIU în CreateProductDto (fix invoicing-
    // guardian: un fallback silențios pe '707' clasifica greșit orice
    // produs-serviciu) — testăm că serviciul nu-l suprascrie, nu că are
    // un default.
    let createData: Record<string, unknown> | undefined;
    prisma.product.create.mockImplementation(
      (args: { data: Record<string, unknown> }) => {
        createData = args.data;
        return Promise.resolve({ id: 'p1' });
      },
    );

    const dto: CreateProductDto = {
      productCode: 'PR-1',
      description: 'Produs test',
      unitOfMeasure: 'buc',
      defaultTaxType: 'Standard',
      revenueAccount: '704',
    };
    await service.create(tenantId, dto);

    expect(createData).toMatchObject({ tenantId, revenueAccount: '704' });
  });

  it('traduce coliziunea de productCode într-un ConflictException', async () => {
    prisma.product.create.mockRejectedValue({ code: 'P2002' });

    const dto: CreateProductDto = {
      productCode: 'PR-1',
      description: 'Produs test',
      unitOfMeasure: 'buc',
      defaultTaxType: 'Standard',
      revenueAccount: '707',
    };
    await expect(service.create(tenantId, dto)).rejects.toThrow(
      ConflictException,
    );
  });

  it('findOne aruncă NotFoundException dacă nu găsește produsul în tenant', async () => {
    prisma.product.findFirst.mockResolvedValue(null);

    await expect(service.findOne(tenantId, 'missing')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('update filtrează explicit după tenantId (regula #6) și dă 404 dacă nu potrivește', async () => {
    prisma.product.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.update(tenantId, 'id-din-alt-tenant', { description: 'Nou' }),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.product.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'id-din-alt-tenant', tenantId } }),
    );
  });

  it('findAll caută case-insensitive pe description și productCode când q e dat', async () => {
    prisma.product.findMany.mockResolvedValue([]);

    await service.findAll(tenantId, 'consultanta');

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId,
          OR: [
            { description: { contains: 'consultanta', mode: 'insensitive' } },
            { productCode: { contains: 'consultanta', mode: 'insensitive' } },
          ],
        },
      }),
    );
  });

  it('findAll filtrează doar după tenantId când q lipsește', async () => {
    prisma.product.findMany.mockResolvedValue([]);

    await service.findAll(tenantId);

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId } }),
    );
  });

  it('remove filtrează explicit după tenantId (regula #6) și dă 404 dacă nu potrivește', async () => {
    prisma.product.deleteMany.mockResolvedValue({ count: 0 });

    await expect(service.remove(tenantId, 'id-din-alt-tenant')).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.product.deleteMany).toHaveBeenCalledWith({
      where: { id: 'id-din-alt-tenant', tenantId },
    });
  });

  it('remove traduce o încălcare de FK (produs folosit pe o factură) într-un ConflictException', async () => {
    prisma.product.deleteMany.mockRejectedValue({ code: 'P2003' });

    await expect(service.remove(tenantId, 'p1')).rejects.toThrow(
      ConflictException,
    );
  });

  it('remove șterge un produs neutilizat fără erori', async () => {
    prisma.product.deleteMany.mockResolvedValue({ count: 1 });

    await expect(service.remove(tenantId, 'p1')).resolves.toBeUndefined();
  });
});
