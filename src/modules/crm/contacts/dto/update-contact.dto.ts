import { Type } from 'class-transformer';
import {
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  ValidateNested,
} from 'class-validator';
import { SocialLinkDto } from './create-contact.dto';

/** `contactCode` NU apare aici, deliberat — identificator stabil, alocat o singură dată la creare. */
export class UpdateContactDto {
  @IsOptional()
  @IsString()
  @Length(1, 255)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(1, 255)
  email?: string | null;

  @IsOptional()
  @IsString()
  @Length(1, 32)
  phone?: string | null;

  @IsOptional()
  @IsString()
  @Length(1, 500)
  address?: string | null;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  position?: string | null;

  // `null` explicit rupe legătura cu compania (contactul redevine „lead"
  // fără companie) — `undefined`/lipsă din body înseamnă neschimbat.
  // `@IsOptional()` tratează `null` la fel ca `undefined` (sare peste
  // `@IsUUID()`), deci nu respinge valoarea `null` — vezi convenția
  // echivalentă pentru `taxId` din CompaniesService.update.
  @IsOptional()
  @IsUUID()
  companyId?: string | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SocialLinkDto)
  socialLinks?: SocialLinkDto[];
}
