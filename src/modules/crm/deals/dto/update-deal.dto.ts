import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Min,
} from 'class-validator';

const DEAL_STATUSES = [
  'proposal',
  'negotiation',
  'closed_won',
  'closed_lost',
] as const;
const DEAL_PRIORITIES = ['low', 'medium', 'high'] as const;

/** `dealCode` NU apare aici, deliberat — identificator stabil, alocat o singură dată la creare. */
export class UpdateDealDto {
  @IsOptional()
  @IsString()
  @Length(1, 255)
  title?: string;

  // `null` explicit rupe legătura — vezi convenția din ContactsService.update.
  @IsOptional()
  @IsUUID()
  contactId?: string | null;

  @IsOptional()
  @IsUUID()
  companyId?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  totalValue?: number;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @IsOptional()
  @IsIn(DEAL_STATUSES, {
    message: `status trebuie să fie unul din: ${DEAL_STATUSES.join(', ')}.`,
  })
  status?: (typeof DEAL_STATUSES)[number];

  @IsOptional()
  @IsIn(DEAL_PRIORITIES, {
    message: `priority trebuie să fie unul din: ${DEAL_PRIORITIES.join(', ')}.`,
  })
  priority?: (typeof DEAL_PRIORITIES)[number];

  @IsOptional()
  @IsDateString()
  dealDate?: string;

  @IsOptional()
  @IsDateString()
  expectedCloseDate?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discountPercent?: number;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  paymentMethod?: string | null;

  @IsOptional()
  @IsUUID()
  invoiceId?: string | null;
}
