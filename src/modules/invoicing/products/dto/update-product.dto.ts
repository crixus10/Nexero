import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator';

const TAX_TYPES = ['Standard', 'Reduced', 'Exempt'] as const;

/**
 * productCode NU apare aici, deliberat — identificator stabil, vezi
 * docs/invoicing-spec.md, secțiunea „Dependență cu modulul Stocuri”.
 * Omisiune intenționată, aplicată de ValidationPipe global
 * (whitelist: true) din src/main.ts.
 */
export class UpdateProductDto {
  @IsOptional()
  @IsString()
  @Length(1, 500)
  description?: string;

  @IsOptional()
  @IsString()
  @Length(1, 32)
  unitOfMeasure?: string;

  @IsOptional()
  @IsIn(TAX_TYPES, {
    message: 'defaultTaxType trebuie să fie Standard, Reduced sau Exempt.',
  })
  defaultTaxType?: (typeof TAX_TYPES)[number];

  @IsOptional()
  @IsNumber()
  @Min(0)
  unitPrice?: number;

  @IsOptional()
  @IsString()
  @Length(1, 16)
  revenueAccount?: string;
}
