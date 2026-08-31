import { ConflictException, NotFoundException } from '@nestjs/common';
import type { AnafService } from '../../../integrations/anaf/anaf.service';
import type { PrismaService } from '../../../prisma/prisma.service';
import { CustomersService } from './customers.service';
import type { CreateCustomerDto } from './dto/create-customer.dto';

describe('CustomersService', () => {
  const tenantId = 'tenant-1';
  let prisma: {
    customer: {
      create: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      updateMany: jest.Mock;
    };
  };
  let anaf: { validateCui: jest.Mock };
  let service: CustomersService;

  beforeEach(() => {
    prisma = {
      customer: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    anaf = { validateCui: jest.fn() };
    service = new CustomersService(
      prisma as unknown as PrismaService,
      anaf as unknown as AnafService,
    );
  });

  it('validează CUI prin AnafService înainte de a crea clientul', async () => {
    anaf.validateCui.mockResolvedValue({
      cui: '12345678',
      isVatPayer: true,
      name: 'Firma X',
      address: null,
    });
    // Captăm argumentul din mockImplementation, nu din .mock.calls[0][0] —
    // jest.Mock (fără generice, ca mai sus) tipează .mock.calls ca `any`,
    // deci indexarea lui e semnalată de @typescript-eslint/no-unsafe-member-access
    // (lint type-checked). Aici tipăm explicit parametrul `args`, deci nu
    // mai accesăm nimic de tip `any`.
    let createData: Record<string, unknown> | undefined;
    prisma.customer.create.mockImplementation(
      (args: { data: Record<string, unknown> }) => {
        createData = args.data;
        return Promise.resolve({ id: 'c1' });
      },
    );

    const dto: CreateCustomerDto = {
      customerCode: 'CL-1',
      name: 'Firma X',
      taxId: 'RO12345678',
    };
    await service.create(tenantId, dto);

    expect(anaf.validateCui).toHaveBeenCalledWith('RO12345678');
    expect(createData).toMatchObject({ tenantId, taxId: '12345678' });
  });

  it('nu apelează ANAF pentru un client fără taxId (B2C)', async () => {
    prisma.customer.create.mockResolvedValue({ id: 'c1' });

    const dto: CreateCustomerDto = {
      customerCode: 'CL-2',
      name: 'Persoană Fizică',
    };
    await service.create(tenantId, dto);

    expect(anaf.validateCui).not.toHaveBeenCalled();
  });

  it('traduce coliziunea de customerCode într-un ConflictException', async () => {
    prisma.customer.create.mockRejectedValue({ code: 'P2002' });

    const dto: CreateCustomerDto = { customerCode: 'CL-1', name: 'Firma X' };
    await expect(service.create(tenantId, dto)).rejects.toThrow(
      ConflictException,
    );
  });

  it('findOne aruncă NotFoundException dacă nu găsește clientul în tenant', async () => {
    prisma.customer.findFirst.mockResolvedValue(null);

    await expect(service.findOne(tenantId, 'missing')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('update filtrează explicit după tenantId (regula #6) și dă 404 dacă nu potrivește', async () => {
    prisma.customer.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.update(tenantId, 'id-din-alt-tenant', { name: 'Nou' }),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.customer.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'id-din-alt-tenant', tenantId } }),
    );
  });
});
