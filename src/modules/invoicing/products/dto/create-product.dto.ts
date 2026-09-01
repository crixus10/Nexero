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
 * `productCode` NU apare aici, deliberat — alocat automat prin
 * `CodeSequenceService` (src/common/code-sequence.service.ts), niciodată
 * acceptat din input client (cerința „ID din nomenclatoare generate
 * automat").
 */
export class CreateProductDto {
  @IsString()
  @Length(1, 500)
  description!: string;

  @IsString()
  @Length(1, 32)
  unitOfMeasure!: string;

  /**
   * Categorie, NU cotă TVA înghețată — cota exactă se rezolvă din
   * tax_codes la adăugarea unei linii de factură (Fază C), nu aici. Vezi
   * docs/invoicing-spec.md, „Nu duplica un produs ca să-i schimbi cota TVA”
   * din CLAUDE.md.
   */
  @IsIn(TAX_TYPES, {
    message: 'defaultTaxType trebuie să fie Standard, Reduced sau Exempt.',
  })
  defaultTaxType!: (typeof TAX_TYPES)[number];

  @IsOptional()
  @IsNumber()
  @Min(0)
  unitPrice?: number;

  /**
   * Cont contabil de venituri (707 mărfuri / 704 servicii / 701 produse
   * finite...) — pregătire Modulul 3. OBLIGATORIU, deliberat — un DEFAULT
   * silențios pe '707' ar clasifica greșit orice produs-serviciu (found de
   * invoicing-guardian la audit: un serviciu creat fără valoare explicită
   * ajungea pe 707 fără ca nimeni să observe, până la jurnalizarea din
   * Modulul 3). Alege explicit din categoriile de mai sus.
   */
  @IsString()
  @Length(1, 16)
  revenueAccount!: string;
}
