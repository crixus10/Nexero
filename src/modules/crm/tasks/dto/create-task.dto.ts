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

export class CreateTaskDto {
  @IsString()
  @Length(1, 255)
  title!: string;

  @IsOptional()
  @IsString()
  @Length(1, 2000)
  description?: string;

  @IsOptional()
  @IsDateString()
  dueAt?: string;

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
  companyId?: string;

  @IsOptional()
  @IsUUID()
  contactId?: string;

  @IsOptional()
  @IsUUID()
  dealId?: string;

  /** Useri reali ai firmei asignați — vezi TaskAssignee. */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  assigneeUserIds?: string[];
}
