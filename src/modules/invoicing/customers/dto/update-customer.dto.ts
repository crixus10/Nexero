import {
  IsBoolean,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';

/**
 * customerCode NU apare aici, deliberat — e identificatorul stabil de care
 * depinde Modulul 2 (vezi docs/invoicing-spec.md, secțiunea „Dependență cu
 * modulul Stocuri”): invoice_lines/invoices deja îl referențiază prin FK,
 * nu se redenumește după creare. Nu adăuga aici un câmp `customerCode?`
 * „ca să fie complet” — omisiunea e intenționată, aplicată de
 * ValidationPipe global (whitelist: true) din src/main.ts.
 */
export class UpdateCustomerDto {
  @IsOptional()
  @IsString()
  @Length(1, 255)
  name?: string;

  /**
   * Șir gol (`""`) șterge explicit un CUI existent (distinct de omiterea
   * câmpului, care lasă taxId neschimbat) — vezi CustomersService.update.
   */
  @IsOptional()
  @IsString()
  taxId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 500)
  address?: string;

  @IsOptional()
  @IsString()
  @Length(1, 20)
  postalCode?: string;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  city?: string;

  @IsOptional()
  @Matches(/^[A-Z]{2}$/, {
    message: 'country trebuie să fie un cod ISO 3166-1 alpha-2 (ex: RO).',
  })
  country?: string;

  @IsOptional()
  @IsBoolean()
  isVatPayer?: boolean;

  @IsOptional()
  @Matches(/^(ro|en)$/, {
    message: 'preferredLanguage acceptă doar "ro" sau "en".',
  })
  preferredLanguage?: string;
}
