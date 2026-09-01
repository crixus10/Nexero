import { Type } from 'class-transformer';
import {
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  ValidateNested,
} from 'class-validator';

/** Un link social afișat pe fișa contactului (ex. { platform: 'LinkedIn', url: '...' }). */
export class SocialLinkDto {
  @IsString()
  @Length(1, 32)
  platform!: string;

  @IsString()
  @Length(1, 500)
  url!: string;
}

/**
 * `contactCode` NU apare aici, deliberat — alocat automat prin
 * `CodeSequenceService` (cerința „ID generat automat").
 */
export class CreateContactDto {
  @IsString()
  @Length(1, 255)
  name!: string;

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
  @Length(1, 500)
  address?: string;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  position?: string;

  /** Companie asociată — opțional, un contact poate exista ca „lead" fără companie. */
  @IsOptional()
  @IsUUID()
  companyId?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SocialLinkDto)
  socialLinks?: SocialLinkDto[];
}
