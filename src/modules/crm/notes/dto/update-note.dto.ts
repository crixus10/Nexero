import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';

const PRIORITIES = ['low', 'medium', 'high'] as const;
const STATUSES = ['pending', 'in_progress', 'done'] as const;

export class UpdateNoteDto {
  @IsOptional()
  @IsString()
  @Length(1, 255)
  title?: string;

  @IsOptional()
  @IsString()
  @Length(1, 10000)
  content?: string | null;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  category?: string | null;

  @IsOptional()
  @IsIn(PRIORITIES, {
    message: `priority trebuie să fie unul din: ${PRIORITIES.join(', ')}.`,
  })
  priority?: (typeof PRIORITIES)[number];

  @IsOptional()
  @IsIn(STATUSES, {
    message: `status trebuie să fie unul din: ${STATUSES.join(', ')}.`,
  })
  status?: (typeof STATUSES)[number];

  @IsOptional()
  @IsDateString()
  dueAt?: string | null;

  @IsOptional()
  @IsBoolean()
  isFavorite?: boolean;

  @IsOptional()
  @IsUUID()
  companyId?: string | null;

  @IsOptional()
  @IsUUID()
  contactId?: string | null;

  @IsOptional()
  @IsUUID()
  dealId?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  assigneeUserIds?: string[];
}
