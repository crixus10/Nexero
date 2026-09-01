import {
  ArrayUnique,
  IsArray,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';

const PRIORITIES = ['low', 'medium', 'high'] as const;
const STATUSES = ['pending', 'in_progress', 'done'] as const;

export class UpdateTaskDto {
  @IsOptional()
  @IsString()
  @Length(1, 255)
  title?: string;

  @IsOptional()
  @IsString()
  @Length(1, 2000)
  description?: string | null;

  @IsOptional()
  @IsDateString()
  dueAt?: string | null;

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
