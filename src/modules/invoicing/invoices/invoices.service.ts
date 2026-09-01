import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AnafService } from '../../../integrations/anaf/anaf.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateCreditNoteDto } from './dto/create-credit-note.dto';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { CreateInvoiceLineDto } from './dto/create-invoice-line.dto';

export type InvoiceWithLines = Prisma.InvoiceGetPayload<{
  include: { lines: true };
}>;

interface DraftInvoiceOptions {
  tenantId: string;
  userId: string;
  seriesCode: string;
  invoiceType: 'Normal' | 'CreditNote';
  companyId: string;
  invoiceDate: Date;
  currency?: string;
  exchangeRate?: number;
  reversedInvoiceId?: string;
  /** invoiceAmount al facturii originale — folosit doar ca plafon pentru
   * suma cumulată a notelor de credit legate de ea (vezi mai jos). */
  reversedInvoiceAmount?: Prisma.Decimal;
  lines: CreateInvoiceLineDto[];
}

/**
 * Fază C — motorul de facturare (vezi docs/roadmap.md). Regula #6 din
 * CLAUDE.md: fiecare query filtrează explicit după tenantId. O factură
 * `issued` sau ulterior NU se editează niciodată aici — singurele scrieri
 * pe un rând existent sunt tranziții de status explicite (issue()), nu un
 * update() generic — asta impune imutabilitatea la nivel de service, nu
 * doar prin convenție (vezi docs/invoicing-spec.md).
 */
@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly anaf: AnafService,
  ) {}

  async createDraft(
    tenantId: string,
    userId: string,
    dto: CreateInvoiceDto,
  ): Promise<InvoiceWithLines> {
    const company = await this.prisma.company.findFirst({
      where: { id: dto.companyId, tenantId },
    });
    if (!company) {
      throw new NotFoundException(`Clientul „${dto.companyId}” nu există.`);
    }

    return this.createDraftInvoice({
      tenantId,
      userId,
      seriesCode: dto.seriesCode,
      invoiceType: 'Normal',
      companyId: company.id,
      invoiceDate: this.parseInvoiceDate(dto.invoiceDate),
      currency: dto.currency,
      exchangeRate: dto.exchangeRate,
      lines: dto.lines,
    });
  }

  /**
   * Notă de credit (storno) — singura cale sancționată de corecție a unei
   * facturi emise (CLAUDE.md: „Nu edita o factură cu status issued...").
   * Merge mereu către clientul facturii originale; liniile sunt date
   * explicit de apelant (`invoicing:approver`), nu oglindite automat —
   * vezi comentariul din CreateCreditNoteDto.
   */
  async createCreditNote(
    tenantId: string,
    userId: string,
    originalInvoiceId: string,
    dto: CreateCreditNoteDto,
  ): Promise<InvoiceWithLines> {
    const original = await this.findOne(tenantId, originalInvoiceId);
    if (original.status === 'draft') {
      throw new ConflictException(
        'Nu poți storna o factură draft — corectează sau șterge draft-ul direct.',
      );
    }

    return this.createDraftInvoice({
      tenantId,
      userId,
      seriesCode: dto.seriesCode,
      invoiceType: 'CreditNote',
      companyId: original.companyId,
      invoiceDate: dto.invoiceDate
        ? this.parseInvoiceDate(dto.invoiceDate)
        : new Date(),
      // Moneda/cursul se moștenesc din original — fix logic-reviewer: fără
      // asta, o factură emisă în EUR primea o notă de credit marcată
      // implicit RON/1, inconsistență directă în datele SAF-T/contabile.
      currency: original.currency,
      exchangeRate: Number(original.exchangeRate),
      reversedInvoiceId: original.id,
      reversedInvoiceAmount: original.invoiceAmount,
      lines: dto.lines,
    });
  }

  /**
   * draft → issued. Singura tranziție care „încheie" o factură — după asta
   * nicio coloană de conținut (linii, sume, client) nu se mai schimbă
   * niciodată; doar `status`/`eInvoiceStatus` mai pot evolua (paid,
   * validated de SPV etc.), în afara scopului acestei faze.
   */
  async issue(
    tenantId: string,
    userId: string,
    invoiceId: string,
  ): Promise<InvoiceWithLines> {
    const invoice = await this.findOne(tenantId, invoiceId);
    if (invoice.status !== 'draft') {
      throw new ConflictException('Doar facturile draft pot fi emise.');
    }

    // Verificare defensivă — suma liniilor trebuie să egaleze
    // invoiceAmount (ar trebui să fie mereu adevărat din
    // createDraftInvoice, dar docs/invoicing-spec.md cere explicit
    // verificare „la emitere", nu doar la creare).
    const computedTotal = invoice.lines.reduce(
      (sum, line) => sum.add(line.lineAmount).add(line.taxAmount),
      new Prisma.Decimal(0),
    );
    if (!computedTotal.equals(invoice.invoiceAmount)) {
      throw new ConflictException(
        'Suma liniilor nu corespunde cu invoiceAmount — factura nu poate fi emisă.',
      );
    }

    // Tranziție atomică draft→issued CU gardă pe status în WHERE
    // (updateMany, nu update pe PK) — fix logic-reviewer: fără asta, două
    // apeluri issue() concurente pe aceeași factură (dublu-click, retry de
    // rețea) ar citi amândouă status='draft' mai sus (înainte de scriere)
    // și ar trece amândouă verificarea, declanșând transmiterea e-Factura
    // de două ori. Postgres execută UPDATE...WHERE ca o singură instrucțiune
    // atomică — al doilea apelator vede deja status='issued' și primește
    // count=0, niciodată o cursă câștigată de amândoi.
    const { count } = await this.prisma.invoice.updateMany({
      where: { id: invoice.id, tenantId, status: 'draft' },
      data: { status: 'issued' },
    });
    if (count === 0) {
      throw new ConflictException('Doar facturile draft pot fi emise.');
    }

    // Declanșare automată e-Factura la draft→issued (obligatoriu prin
    // lege, CLAUDE.md) — prin adaptorul izolat, niciodată logică proprie
    // aici. STUB azi (vezi AnafService.submitEInvoice) — status rămâne
    // `pending` până se implementează transmiterea SPV reală. Apelat abia
    // DUPĂ ce tranziția de mai sus a reușit garantat o singură dată — nu
    // înainte, ca să nu rulăm submitEInvoice pentru un apel care ar fi
    // pierdut oricum cursa pe status.
    const eInvoiceResult = this.anaf.submitEInvoice(invoice.id);

    return this.prisma.$transaction(async (tx) => {
      // updateMany (nu update) — where poate filtra pe tenantId direct
      // (regula #6), spre deosebire de update(), limitat la un where unic
      // pe PK. Aceeași convenție ca în CompaniesService/ProductsService —
      // fix logic-reviewer: id-ul e deja verificat prin findOne(tenantId,
      // ...) mai sus, deci neexploatabil azi, dar explicit e mai sigur
      // decât implicit dacă vreodată codul din jur se refactorizează.
      await tx.invoice.updateMany({
        where: { id: invoice.id, tenantId },
        data: { eInvoiceStatus: eInvoiceResult.status },
      });
      await tx.invoiceAuditLog.create({
        data: { invoiceId: invoice.id, action: 'issued', performedBy: userId },
      });
      return tx.invoice.findFirstOrThrow({
        where: { id: invoice.id, tenantId },
        include: { lines: true },
      });
    });
  }

  async findAll(tenantId: string): Promise<InvoiceWithLines[]> {
    return this.prisma.invoice.findMany({
      where: { tenantId },
      include: { lines: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(tenantId: string, id: string): Promise<InvoiceWithLines> {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, tenantId },
      include: { lines: true },
    });
    if (!invoice) {
      throw new NotFoundException(`Factura „${id}” nu există.`);
    }
    return invoice;
  }

  private async createDraftInvoice(
    opts: DraftInvoiceOptions,
  ): Promise<InvoiceWithLines> {
    const series = await this.prisma.invoiceSeries.findFirst({
      where: { tenantId: opts.tenantId, seriesCode: opts.seriesCode },
    });
    if (!series) {
      throw new NotFoundException(`Seria „${opts.seriesCode}” nu există.`);
    }

    return this.prisma.$transaction(async (tx) => {
      // Rezolvă linii (cotă TVA + sume) ÎN aceeași tranzacție ca scrierea,
      // ca citirea din tax_codes să fie consistentă cu restul operației.
      let invoiceAmount = new Prisma.Decimal(0);
      const resolvedLines: Prisma.InvoiceLineCreateManyInvoiceInput[] = [];
      let lineNumber = 1;
      for (const line of opts.lines) {
        const taxCode = await this.resolveTaxCode(
          tx,
          opts.tenantId,
          opts.invoiceDate,
          line,
        );
        const { lineAmount, taxAmount } = this.computeLineAmounts(
          line,
          taxCode.taxPercentage,
        );
        invoiceAmount = invoiceAmount.add(lineAmount).add(taxAmount);
        resolvedLines.push({
          lineNumber: lineNumber++,
          productId: line.productId,
          description: line.description,
          quantity: line.quantity,
          unitOfMeasure: line.unitOfMeasure,
          unitPrice: line.unitPrice,
          lineAmount,
          taxCodeId: taxCode.id,
          taxAmount,
        });
      }

      // Plafon pe suma cumulată a notelor de credit legate de un original
      // (fix logic-reviewer — fără asta, invoicing:approver putea storna
      // aceeași factură de N ori sau cu o sumă mai mare decât originalul,
      // gaură reală de control financiar/SAF-T). Recalculat AICI, în
      // aceeași tranzacție care inserează noua notă — nu în afara ei —
      // altfel două cereri concurente de storno pe același original ar
      // putea trece amândouă verificarea înainte ca vreuna să scrie.
      if (opts.reversedInvoiceId && opts.reversedInvoiceAmount) {
        const existing = await tx.invoice.aggregate({
          where: {
            reversedInvoiceId: opts.reversedInvoiceId,
            invoiceType: 'CreditNote',
          },
          _sum: { invoiceAmount: true },
        });
        const alreadyStorned =
          existing._sum.invoiceAmount ?? new Prisma.Decimal(0);
        const totalAfter = alreadyStorned.add(invoiceAmount);
        if (totalAfter.greaterThan(opts.reversedInvoiceAmount)) {
          throw new ConflictException(
            `Suma stornată (${totalAfter.toString()}) ar depăși valoarea facturii originale (${opts.reversedInvoiceAmount.toString()}).`,
          );
        }
      }

      // Numerotare atomică, fără goluri (docs/invoicing-spec.md, „Numerotare
      // — regulă obligatorie") — UPDATE ... SET next_number = next_number +
      // 1 e o singură instrucțiune SQL, atomică la nivel de rând sub
      // tranzacție Postgres; două request-uri concurente se serializează pe
      // lock-ul rândului, niciodată nu primesc același număr. Niciodată
      // MAX(invoice_no) — exact cursa interzisă de spec.
      const updatedSeries = await tx.invoiceSeries.update({
        where: { id: series.id },
        data: { nextNumber: { increment: 1 } },
      });
      const allocatedNumber = updatedSeries.nextNumber - 1;
      const invoiceNo = `${opts.seriesCode}/${opts.invoiceDate.getUTCFullYear()}/${String(
        allocatedNumber,
      ).padStart(4, '0')}`;

      const invoice = await tx.invoice.create({
        data: {
          tenantId: opts.tenantId,
          seriesId: series.id,
          invoiceNo,
          invoiceDate: opts.invoiceDate,
          // taxPointDate = invoiceDate implicit (simplificare deliberată
          // pentru această fază — cazuri unde diferă, ex. avansuri, rămân
          // pentru o extensie ulterioară a DTO-ului, nespecificată încă).
          taxPointDate: opts.invoiceDate,
          invoiceType: opts.invoiceType,
          companyId: opts.companyId,
          currency: opts.currency ?? 'RON',
          exchangeRate: opts.exchangeRate ?? 1,
          status: 'draft',
          invoiceAmount,
          reversedInvoiceId: opts.reversedInvoiceId,
          createdBy: opts.userId,
          lines: { create: resolvedLines },
        },
        include: { lines: true },
      });

      await tx.invoiceAuditLog.create({
        data: {
          invoiceId: invoice.id,
          action: 'created',
          performedBy: opts.userId,
        },
      });

      return invoice;
    });
  }

  /**
   * Query exact din docs/invoicing-spec.md, „Rezolvarea cotei TVA la
   * momentul facturării" — interval semi-deschis [validFrom, validTo).
   * `taxCodeId` explicit pe linie = override manual (issuer alege alt rând
   * valid decât cel implicit); fără el, se rezolvă din categoria
   * produsului.
   */
  private async resolveTaxCode(
    tx: Prisma.TransactionClient,
    tenantId: string,
    invoiceDate: Date,
    line: CreateInvoiceLineDto,
  ): Promise<{ id: string; taxPercentage: Prisma.Decimal }> {
    if (line.taxCodeId) {
      const taxCode = await tx.taxCode.findFirst({
        where: {
          id: line.taxCodeId,
          validFrom: { lte: invoiceDate },
          OR: [{ validTo: null }, { validTo: { gt: invoiceDate } }],
        },
      });
      if (!taxCode) {
        throw new BadRequestException(
          `taxCodeId „${line.taxCodeId}” nu e o cotă TVA validă la data facturii.`,
        );
      }
      return taxCode;
    }

    if (!line.productId) {
      throw new BadRequestException(
        'O linie fără productId trebuie să dea taxCodeId explicit.',
      );
    }
    const product = await tx.product.findFirst({
      where: { id: line.productId, tenantId },
    });
    if (!product) {
      throw new NotFoundException(`Produsul „${line.productId}” nu există.`);
    }
    const taxCode = await tx.taxCode.findFirst({
      where: {
        taxType: product.defaultTaxType,
        validFrom: { lte: invoiceDate },
        OR: [{ validTo: null }, { validTo: { gt: invoiceDate } }],
      },
      orderBy: [{ isDefault: 'desc' }, { validFrom: 'desc' }],
    });
    if (!taxCode) {
      // Exact scenariul BLOCANT găsit de logic-reviewer în seed.ts (gol de
      // o zi la granița 2025-07-31/08-01) — acum prevenit de fix-ul de
      // dată + CHECK-ul din migrare, dar tratat oricum defensiv aici: o
      // gaură reală în tax_codes tot ar trebui să dea un mesaj clar unui
      // utilizator, nu un crash.
      throw new ConflictException(
        `Nicio cotă TVA validă pentru categoria „${product.defaultTaxType}” la data ${invoiceDate.toISOString().slice(0, 10)}.`,
      );
    }
    return taxCode;
  }

  private computeLineAmounts(
    line: CreateInvoiceLineDto,
    taxPercentage: Prisma.Decimal,
  ): { lineAmount: Prisma.Decimal; taxAmount: Prisma.Decimal } {
    const quantity = new Prisma.Decimal(line.quantity);
    const unitPrice = new Prisma.Decimal(line.unitPrice);
    const lineAmount = quantity.mul(unitPrice).toDecimalPlaces(2);
    const taxAmount = lineAmount.mul(taxPercentage).div(100).toDecimalPlaces(2);
    return { lineAmount, taxAmount };
  }

  private parseInvoiceDate(raw: string): Date {
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`invoiceDate „${raw}” nu e o dată validă.`);
    }
    return date;
  }
}
