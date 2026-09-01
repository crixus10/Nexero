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

/**
 * `dealCode` NU apare aici, deliberat — alocat automat prin
 * `CodeSequenceService` (format `DEAL-{an}-{secvență}`).
 */
export class CreateDealDto {
  @IsString()
  @Length(1, 255)
  title!: string;

  @IsOptional()
  @IsUUID()
  contactId?: string;

  @IsOptional()
  @IsUUID()
  companyId?: string;

  @IsNumber()
  @Min(0)
  totalValue!: number;

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

  @IsDateString()
  dealDate!: string;

  @IsOptional()
  @IsDateString()
  expectedCloseDate?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discountPercent?: number;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  paymentMethod?: string;

  /**
   * Legătură REALĂ cu o factură emisă din modulul de facturare — nu un
   * string decorativ. Trebuie să aparțină aceluiași tenant (verificat
   * explicit în DealsService, nu doar prin FK — FK-ul Prisma nu verifică
   * tenant_id, ar fi o gaură IDOR fără verificarea din service).
   */
  @IsOptional()
  @IsUUID()
  invoiceId?: string;
}
