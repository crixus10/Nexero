import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Min,
  ValidateNested,
} from 'class-validator';
import { CreateInvoiceLineDto } from './create-invoice-line.dto';

export class CreateInvoiceDto {
  /** Cod de serie existent (invoice_series.series_code), ex. 'FACT'. */
  @IsString()
  @Length(1, 32)
  seriesCode!: string;

  @IsUUID()
  companyId!: string;

  /** ISO 8601 (ex. '2026-08-31') — validată contra tax_codes la această dată. */
  @IsDateString()
  invoiceDate!: string;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  exchangeRate?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateInvoiceLineDto)
  lines!: CreateInvoiceLineDto[];
}
