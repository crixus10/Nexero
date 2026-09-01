// Oglindesc DTO-urile/modelele reale din backend (src/modules/invoicing/,
// src/auth/) — doar câmpurile folosite în UI, nu tot ce există în schema.
// Câmpurile Decimal din Prisma (unitPrice, invoiceAmount etc.) sosesc ca
// STRING în JSON (Decimal.toJSON()), niciodată number — de-asta tipurile
// de mai jos le tratează ca string, nu number.

export interface AuthenticatedUser {
  userId: string;
  tenantId: string;
}

export type TaxType = 'Standard' | 'Reduced' | 'Exempt';

export interface Customer {
  id: string;
  customerCode: string;
  name: string;
  taxId: string | null;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  country: string;
  isVatPayer: boolean;
  preferredLanguage: string;
}

export interface Product {
  id: string;
  productCode: string;
  description: string;
  unitOfMeasure: string;
  defaultTaxType: TaxType;
  unitPrice: string | null;
  revenueAccount: string;
}

export type DocumentType = 'invoice' | 'proforma' | 'credit_note' | 'debit_note' | 'down_payment';

export interface InvoiceSeries {
  id: string;
  seriesCode: string;
  documentType: DocumentType;
  nextNumber: number;
}

export interface InvoiceLine {
  id: string;
  lineNumber: number;
  productId: string | null;
  description: string;
  quantity: string;
  unitOfMeasure: string;
  unitPrice: string;
  lineAmount: string;
  taxCodeId: string;
  taxAmount: string;
}

export type InvoiceStatus =
  | 'draft'
  | 'issued'
  | 'sent'
  | 'paid'
  | 'partially_paid'
  | 'overdue'
  | 'canceled';

export interface Invoice {
  id: string;
  seriesId: string;
  invoiceNo: string;
  invoiceDate: string;
  invoiceType: 'Normal' | 'CreditNote' | 'DebitNote' | 'DownPayment';
  customerId: string;
  currency: string;
  status: InvoiceStatus;
  invoiceAmount: string;
  eInvoiceStatus: string | null;
  createdAt: string;
  lines: InvoiceLine[];
}

export interface CreateInvoiceLinePayload {
  productId?: string;
  description: string;
  quantity: number;
  unitOfMeasure: string;
  unitPrice: number;
  taxCodeId?: string;
}

export interface CreateInvoicePayload {
  seriesCode: string;
  customerId: string;
  invoiceDate: string;
  currency?: string;
  lines: CreateInvoiceLinePayload[];
}
