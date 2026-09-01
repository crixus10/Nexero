import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  Length,
  ValidateNested,
} from 'class-validator';
import { CreateInvoiceLineDto } from './create-invoice-line.dto';

/**
 * Notă de credit (storno) — legată explicit de factura originală (calea
 * din URL, /invoices/:id/credit-notes), nu de un companyId separat: merge
 * mereu către clientul facturii originale (vezi docs/invoicing-spec.md).
 * Liniile sunt date explicit de apelant (`invoicing:approver`), NU
 * oglindite/negate automat din original — permite corecții parțiale
 * (aceeași filozofie ca liniile unei facturi noi: valorile reale ale
 * corecției, nu o presupunere).
 */
export class CreateCreditNoteDto {
  /** Cod de serie pentru note de credit (invoice_series.document_type = 'credit_note'). */
  @IsString()
  @Length(1, 32)
  seriesCode!: string;

  @IsOptional()
  @IsDateString()
  invoiceDate?: string; // implicit: azi

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateInvoiceLineDto)
  lines!: CreateInvoiceLineDto[];
}
