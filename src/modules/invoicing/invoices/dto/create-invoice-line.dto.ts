import {
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Min,
} from 'class-validator';

/**
 * O linie fără `productId` trebuie să dea `taxCodeId` explicit — fără
 * produs nu există `defaultTaxType` din care să rezolvăm automat cota
 * (vezi InvoicesService.resolveTaxCodeForLine). Validat în service, nu
 * aici — class-validator nu exprimă ușor „cel puțin unul din două câmpuri".
 */
export class CreateInvoiceLineDto {
  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsString()
  @Length(1, 500)
  description!: string;

  // maxDecimalPlaces aliniat la coloana DB (Decimal(14,3)/(14,4)) — fără
  // el, Postgres ar rotunji silențios la insert un input cu mai multe
  // zecimale decât precizia coloanei, în loc să respingă clar cu 400
  // (fix minor logic-reviewer).
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  quantity!: number;

  @IsString()
  @Length(1, 32)
  unitOfMeasure!: string;

  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  unitPrice!: number;

  /**
   * Override manual — issuer-ul poate alege explicit alt rând valid din
   * tax_codes decât cel rezolvat automat din categoria produsului (vezi
   * docs/invoicing-spec.md, „Rezolvarea cotei TVA la momentul facturării":
   * același produs poate ieși cu cotă diferită în funcție de context —
   * livrare intracomunitară 0%, promoție etc.).
   */
  @IsOptional()
  @IsUUID()
  taxCodeId?: string;
}
