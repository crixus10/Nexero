import {
  IsBoolean,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';

export class CreateCustomerDto {
  @IsString()
  @Length(1, 64)
  customerCode!: string;

  @IsString()
  @Length(1, 255)
  name!: string;

  /**
   * CUI/CIF (SAF-T: CustomerTaxID). Opțional — un client B2C fără cod
   * fiscal e valid (vezi docs/invoicing-spec.md, secțiunea „e-Factura
   * ANAF”: placeholder-ul 0000000000000 la generarea XML). Dacă e dat,
   * CustomersService îl validează prin AnafService (src/integrations/anaf)
   * înainte de a salva — niciodată acceptat necondiționat.
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
