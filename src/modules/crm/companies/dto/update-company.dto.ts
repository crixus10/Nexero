import {
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';

const CONNECTION_STRENGTHS = [
  'very_weak',
  'weak',
  'medium',
  'strong',
  'very_strong',
] as const;

/**
 * `companyCode` NU apare aici, deliberat — identificator stabil, alocat o
 * singură dată la creare (aceeași motivație ca fostul `customerCode`, vezi
 * docs/invoicing-spec.md, „Dependență cu modulul Stocuri"): invoices deja
 * îl referențiază prin FK, nu se redenumește după creare.
 */
export class UpdateCompanyDto {
  @IsOptional()
  @IsString()
  @Length(1, 255)
  name?: string;

  /** Șir gol (`""`) șterge explicit un CUI existent — vezi CompaniesService.update. */
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

  @IsOptional()
  @IsString()
  @Length(1, 255)
  website?: string;

  @IsOptional()
  @IsString()
  @Length(1, 255)
  email?: string;

  @IsOptional()
  @IsString()
  @Length(1, 32)
  phone?: string;

  @IsOptional()
  @IsString()
  @Length(1, 2000)
  description?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categories?: string[];

  @IsOptional()
  @IsIn(CONNECTION_STRENGTHS, {
    message: `connectionStrength trebuie să fie unul din: ${CONNECTION_STRENGTHS.join(', ')}.`,
  })
  connectionStrength?: (typeof CONNECTION_STRENGTHS)[number];

  @IsOptional()
  @IsString()
  @Length(1, 32)
  estimatedRevenueRange?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  teamUserIds?: string[];
}
