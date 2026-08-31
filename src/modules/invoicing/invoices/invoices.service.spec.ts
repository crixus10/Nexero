import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AnafService } from '../../../integrations/anaf/anaf.service';
import type { PrismaService } from '../../../prisma/prisma.service';
import type { CreateInvoiceDto } from './dto/create-invoice.dto';
import { InvoicesService } from './invoices.service';

describe('InvoicesService', () => {
  const tenantId = 'tenant-1';
  const userId = 'user-1';
  const invoiceDate = '2026-08-31';

  let prisma: {
    customer: { findFirst: jest.Mock };
    invoice: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    invoiceSeries: { findFirst: jest.Mock };
    $transaction: jest.Mock;
  };
  let tx: {
    invoiceSeries: { update: jest.Mock };
    invoice: {
      create: jest.Mock;
      updateMany: jest.Mock;
      findFirstOrThrow: jest.Mock;
      aggregate: jest.Mock;
    };
    invoiceAuditLog: { create: jest.Mock };
    taxCode: { findFirst: jest.Mock };
    product: { findFirst: jest.Mock };
  };
  let anaf: { submitEInvoice: jest.Mock };
  let service: InvoicesService;

  const S21 = {
    id: 'tax-s21',
    taxCode: 'S21',
    taxType: 'Standard',
    taxPercentage: new Prisma.Decimal('21.00'),
  };

  beforeEach(() => {
    tx = {
      invoiceSeries: { update: jest.fn() },
      invoice: {
        create: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findFirstOrThrow: jest.fn(),
        // Nicio notă de credit existentă, implicit — suprascris explicit
        // în testele care verifică plafonul.
        aggregate: jest
          .fn()
          .mockResolvedValue({ _sum: { invoiceAmount: null } }),
      },
      invoiceAuditLog: { create: jest.fn() },
      taxCode: { findFirst: jest.fn() },
      product: { findFirst: jest.fn() },
    };
    prisma = {
      customer: { findFirst: jest.fn() },
      invoice: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      invoiceSeries: { findFirst: jest.fn() },
      $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(tx)),
    };
    anaf = { submitEInvoice: jest.fn().mockReturnValue({ status: 'pending' }) };
    service = new InvoicesService(
      prisma as unknown as PrismaService,
      anaf as unknown as AnafService,
    );
  });

  describe('createDraft', () => {
    const baseDto: CreateInvoiceDto = {
      seriesCode: 'FACT',
      customerId: 'cust-1',
      invoiceDate,
      lines: [
        {
          productId: 'prod-1',
          description: 'Serviciu X',
          quantity: 2,
          unitOfMeasure: 'buc',
          unitPrice: 100,
        },
      ],
    };

    it('aruncă NotFoundException dacă clientul nu există în tenant', async () => {
      prisma.customer.findFirst.mockResolvedValue(null);
      await expect(
        service.createDraft(tenantId, userId, baseDto),
      ).rejects.toThrow(NotFoundException);
    });

    it('aruncă NotFoundException dacă seria nu există', async () => {
      prisma.customer.findFirst.mockResolvedValue({ id: 'cust-1' });
      prisma.invoiceSeries.findFirst.mockResolvedValue(null);
      await expect(
        service.createDraft(tenantId, userId, baseDto),
      ).rejects.toThrow(NotFoundException);
    });

    it('rezolvă cota TVA din categoria produsului, calculează sumele și alocă numărul atomic', async () => {
      prisma.customer.findFirst.mockResolvedValue({ id: 'cust-1' });
      prisma.invoiceSeries.findFirst.mockResolvedValue({
        id: 'series-1',
        tenantId,
        seriesCode: 'FACT',
      });
      tx.product.findFirst.mockResolvedValue({
        id: 'prod-1',
        defaultTaxType: 'Standard',
      });
      tx.taxCode.findFirst.mockResolvedValue(S21);
      // next_number era 7 înainte de increment — Prisma update cu
      // {increment:1} întoarce rândul DUPĂ scriere, deci 8; numărul alocat
      // e 8-1=7 (numărul PRE-increment, exact ce trebuia alocat acum).
      tx.invoiceSeries.update.mockResolvedValue({
        id: 'series-1',
        nextNumber: 8,
      });
      let createData: Record<string, unknown> | undefined;
      tx.invoice.create.mockImplementation(
        (args: { data: Record<string, unknown> }) => {
          createData = args.data;
          return Promise.resolve({ id: 'inv-1', ...args.data, lines: [] });
        },
      );
      let auditLogData: Record<string, unknown> | undefined;
      tx.invoiceAuditLog.create.mockImplementation(
        (args: { data: Record<string, unknown> }) => {
          auditLogData = args.data;
          return Promise.resolve({});
        },
      );

      const result = await service.createDraft(tenantId, userId, baseDto);

      expect(tx.taxCode.findFirst).toHaveBeenCalled();
      expect(createData?.invoiceNo).toBe('FACT/2026/0007');
      expect(createData?.status).toBe('draft');
      // 2 * 100 = 200 lineAmount, 21% => 42 taxAmount => 242 total.
      expect((createData?.invoiceAmount as Prisma.Decimal).toString()).toBe(
        '242',
      );
      expect(auditLogData).toMatchObject({
        action: 'created',
        performedBy: userId,
      });
      expect(result.id).toBe('inv-1');
    });

    it('linie fără productId și fără taxCodeId → BadRequestException', async () => {
      prisma.customer.findFirst.mockResolvedValue({ id: 'cust-1' });
      prisma.invoiceSeries.findFirst.mockResolvedValue({
        id: 'series-1',
        tenantId,
        seriesCode: 'FACT',
      });

      const dto: CreateInvoiceDto = {
        ...baseDto,
        lines: [
          {
            description: 'Fără produs',
            quantity: 1,
            unitOfMeasure: 'buc',
            unitPrice: 10,
          },
        ],
      };

      await expect(service.createDraft(tenantId, userId, dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('nicio cotă TVA validă la data facturii → ConflictException (fix logic-reviewer, gol seed 2025-07-31)', async () => {
      prisma.customer.findFirst.mockResolvedValue({ id: 'cust-1' });
      prisma.invoiceSeries.findFirst.mockResolvedValue({
        id: 'series-1',
        tenantId,
        seriesCode: 'FACT',
      });
      tx.product.findFirst.mockResolvedValue({
        id: 'prod-1',
        defaultTaxType: 'Standard',
      });
      tx.taxCode.findFirst.mockResolvedValue(null);

      await expect(
        service.createDraft(tenantId, userId, baseDto),
      ).rejects.toThrow(ConflictException);
    });

    it('taxCodeId explicit (override manual) e folosit fără să mai consulte produsul', async () => {
      prisma.customer.findFirst.mockResolvedValue({ id: 'cust-1' });
      prisma.invoiceSeries.findFirst.mockResolvedValue({
        id: 'series-1',
        tenantId,
        seriesCode: 'FACT',
      });
      tx.taxCode.findFirst.mockResolvedValue(S21);
      tx.invoiceSeries.update.mockResolvedValue({
        id: 'series-1',
        nextNumber: 1,
      });
      tx.invoice.create.mockImplementation(
        (args: { data: Record<string, unknown> }) =>
          Promise.resolve({ id: 'inv-1', ...args.data, lines: [] }),
      );

      const dto: CreateInvoiceDto = {
        ...baseDto,
        lines: [
          {
            description: 'Livrare intracomunitară',
            quantity: 1,
            unitOfMeasure: 'buc',
            unitPrice: 50,
            taxCodeId: 'tax-s21',
          },
        ],
      };

      await service.createDraft(tenantId, userId, dto);
      expect(tx.product.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('issue', () => {
    const draftInvoice = {
      id: 'inv-1',
      tenantId,
      status: 'draft',
      invoiceAmount: new Prisma.Decimal('242'),
      lines: [
        {
          lineAmount: new Prisma.Decimal('200'),
          taxAmount: new Prisma.Decimal('42'),
        },
      ],
    };

    it('aruncă ConflictException dacă factura nu e draft', async () => {
      prisma.invoice.findFirst.mockResolvedValue({
        ...draftInvoice,
        status: 'issued',
      });
      await expect(service.issue(tenantId, userId, 'inv-1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('aruncă ConflictException dacă suma liniilor nu corespunde cu invoiceAmount', async () => {
      prisma.invoice.findFirst.mockResolvedValue({
        ...draftInvoice,
        invoiceAmount: new Prisma.Decimal('999'),
      });
      await expect(service.issue(tenantId, userId, 'inv-1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('aruncă ConflictException dacă tranziția draft→issued pierde cursa (issue() concurent — fix logic-reviewer)', async () => {
      // updateMany cu gardă status:'draft' în WHERE — dacă un alt apel a
      // câștigat deja cursa, count=0. submitEInvoice NU trebuie apelat.
      prisma.invoice.findFirst.mockResolvedValue(draftInvoice);
      prisma.invoice.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.issue(tenantId, userId, 'inv-1')).rejects.toThrow(
        ConflictException,
      );
      expect(anaf.submitEInvoice).not.toHaveBeenCalled();
    });

    it('emite factura: tranziție atomică, eInvoiceStatus din stub-ul AnafService, audit log', async () => {
      prisma.invoice.findFirst.mockResolvedValue(draftInvoice);
      prisma.invoice.updateMany.mockResolvedValue({ count: 1 });
      let updateManyData: Record<string, unknown> | undefined;
      let updateManyWhere: Record<string, unknown> | undefined;
      tx.invoice.updateMany.mockImplementation(
        (args: {
          where: Record<string, unknown>;
          data: Record<string, unknown>;
        }) => {
          updateManyWhere = args.where;
          updateManyData = args.data;
          return Promise.resolve({ count: 1 });
        },
      );
      tx.invoice.findFirstOrThrow.mockResolvedValue({
        ...draftInvoice,
        status: 'issued',
        eInvoiceStatus: 'pending',
      });
      let auditLogData: Record<string, unknown> | undefined;
      tx.invoiceAuditLog.create.mockImplementation(
        (args: { data: Record<string, unknown> }) => {
          auditLogData = args.data;
          return Promise.resolve({});
        },
      );

      const result = await service.issue(tenantId, userId, 'inv-1');

      expect(prisma.invoice.updateMany).toHaveBeenCalledWith({
        where: { id: 'inv-1', tenantId, status: 'draft' },
        data: { status: 'issued' },
      });
      expect(anaf.submitEInvoice).toHaveBeenCalledWith('inv-1');
      // fix logic-reviewer — updateMany (nu update), tenantId explicit în
      // where, nu doar id.
      expect(updateManyWhere).toEqual({ id: 'inv-1', tenantId });
      expect(updateManyData).toEqual({ eInvoiceStatus: 'pending' });
      expect(auditLogData).toMatchObject({
        action: 'issued',
        performedBy: userId,
      });
      expect(result.status).toBe('issued');
    });
  });

  describe('createCreditNote', () => {
    it('aruncă ConflictException dacă originalul e încă draft', async () => {
      prisma.invoice.findFirst.mockResolvedValue({
        id: 'orig-1',
        tenantId,
        status: 'draft',
        customerId: 'cust-1',
        lines: [],
      });

      await expect(
        service.createCreditNote(tenantId, userId, 'orig-1', {
          seriesCode: 'STORNO',
          lines: [
            {
              description: 'Corecție',
              quantity: 1,
              unitOfMeasure: 'buc',
              unitPrice: 10,
              taxCodeId: 'tax-s21',
            },
          ],
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('creează nota de credit legată de original, cu invoiceType/monedă/curs moștenite', async () => {
      prisma.invoice.findFirst.mockResolvedValue({
        id: 'orig-1',
        tenantId,
        status: 'issued',
        customerId: 'cust-1',
        currency: 'EUR',
        exchangeRate: new Prisma.Decimal('4.97'),
        invoiceAmount: new Prisma.Decimal('100'),
        lines: [],
      });
      prisma.invoiceSeries.findFirst.mockResolvedValue({
        id: 'series-storno',
        tenantId,
        seriesCode: 'STORNO',
      });
      tx.taxCode.findFirst.mockResolvedValue(S21);
      tx.invoiceSeries.update.mockResolvedValue({
        id: 'series-storno',
        nextNumber: 2,
      });
      let createData: Record<string, unknown> | undefined;
      tx.invoice.create.mockImplementation(
        (args: { data: Record<string, unknown> }) => {
          createData = args.data;
          return Promise.resolve({ id: 'cn-1', ...args.data, lines: [] });
        },
      );

      await service.createCreditNote(tenantId, userId, 'orig-1', {
        seriesCode: 'STORNO',
        lines: [
          {
            description: 'Corecție',
            quantity: 1,
            unitOfMeasure: 'buc',
            unitPrice: 10,
            taxCodeId: 'tax-s21',
          },
        ],
      });

      expect(createData?.invoiceType).toBe('CreditNote');
      expect(createData?.reversedInvoiceId).toBe('orig-1');
      expect(createData?.customerId).toBe('cust-1');
      // fix logic-reviewer — moneda/cursul se moștenesc din original, nu
      // cad pe implicit RON/1.
      expect(createData?.currency).toBe('EUR');
      expect(
        (createData?.exchangeRate as Prisma.Decimal | number).toString(),
      ).toBe('4.97');
    });

    it('respinge o notă de credit care ar depăși suma facturii originale (fix logic-reviewer)', async () => {
      prisma.invoice.findFirst.mockResolvedValue({
        id: 'orig-1',
        tenantId,
        status: 'issued',
        customerId: 'cust-1',
        currency: 'RON',
        exchangeRate: new Prisma.Decimal('1'),
        invoiceAmount: new Prisma.Decimal('100'), // deja stornat 90 mai jos
        lines: [],
      });
      prisma.invoiceSeries.findFirst.mockResolvedValue({
        id: 'series-storno',
        tenantId,
        seriesCode: 'STORNO',
      });
      tx.taxCode.findFirst.mockResolvedValue({
        ...S21,
        taxPercentage: new Prisma.Decimal('0'), // simplu: linie fără TVA
      });
      // 90 deja stornat pe note de credit anterioare pentru acest original.
      tx.invoice.aggregate.mockResolvedValue({
        _sum: { invoiceAmount: new Prisma.Decimal('90') },
      });

      await expect(
        service.createCreditNote(tenantId, userId, 'orig-1', {
          seriesCode: 'STORNO',
          // Linie nouă de 20 → 90 + 20 = 110 > 100 (originalul) → refuzat.
          lines: [
            {
              description: 'Corecție suplimentară',
              quantity: 1,
              unitOfMeasure: 'buc',
              unitPrice: 20,
              taxCodeId: 'tax-s21',
            },
          ],
        }),
      ).rejects.toThrow(ConflictException);
      expect(tx.invoice.create).not.toHaveBeenCalled();
    });
  });
});
