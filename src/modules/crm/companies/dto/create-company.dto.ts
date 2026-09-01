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
 * `companyCode` NU apare aici, deliberat — se alocă automat prin
 * `CodeSequenceService` (src/common/code-sequence.service.ts), niciodată
 * acceptat din input client (cerința explicită „ID generat automat").
 */
export class CreateCompanyDto {
  @IsString()
  @Length(1, 255)
  name!: string;

  /**
   * Cod fiscal (CUI/CNP) — CustomerTaxID (SAF-T). Opțional — un lead fără
   * cod fiscal încă e valid, dar dacă e dat, CompaniesService îl validează
   * prin AnafService (src/integrations/anaf) înainte de a salva.
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

  /** ID-uri de useri reali ai firmei — vezi CompanyTeamMember. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  teamUserIds?: string[];
}
