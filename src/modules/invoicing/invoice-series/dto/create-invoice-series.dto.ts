import { IsIn, IsString, Length } from 'class-validator';

const DOCUMENT_TYPES = [
  'invoice',
  'proforma',
  'credit_note',
  'debit_note',
  'down_payment',
] as const;

export class CreateInvoiceSeriesDto {
  /** Cod scurt, unic per tenant — ex. 'FACT', 'PROF', 'AVANS', 'STORNO'. */
  @IsString()
  @Length(1, 32)
  seriesCode!: string;

  @IsIn(DOCUMENT_TYPES, {
    message: `documentType trebuie să fie unul din: ${DOCUMENT_TYPES.join(', ')}.`,
  })
  documentType!: (typeof DOCUMENT_TYPES)[number];
}
