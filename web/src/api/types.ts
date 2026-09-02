// Oglindesc DTO-urile/modelele reale din backend (src/modules/invoicing/,
// src/modules/crm/, src/auth/) — doar câmpurile folosite în UI, nu tot ce
// există în schema. Câmpurile Decimal din Prisma (unitPrice, invoiceAmount,
// totalValue etc.) sosesc ca STRING în JSON (Decimal.toJSON()), niciodată
// number — de-asta tipurile de mai jos le tratează ca string, nu number.

export interface AuthenticatedUser {
  userId: string;
  tenantId: string;
}

/** GET /auth/me — identic cu AuthenticatedUser + numele firmei active (pentru afișare în header). */
export interface CurrentUserInfo extends AuthenticatedUser {
  tenantName: string;
}

/** GET /users — restricționat la owner/admin (rol global); vezi UsersApi. */
export interface UserRef {
  id: string;
  email: string;
  fullName: string;
}

export type TaxType = 'Standard' | 'Reduced' | 'Exempt';

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
  companyId: string;
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
  companyId: string;
  invoiceDate: string;
  currency?: string;
  lines: CreateInvoiceLinePayload[];
}

// ── CRM ("Clienți" în UI) — docs/crm-spec.md ────────────────────────────

export type ConnectionStrength = 'very_weak' | 'weak' | 'medium' | 'strong' | 'very_strong';

export interface TeamMemberRef {
  userId: string;
  user: { id: string; fullName: string; email: string };
}

/** Companie client — CustomerID/CompanyName (SAF-T) + înregistrare CRM. */
export interface Company {
  id: string;
  companyCode: string;
  name: string;
  taxId: string | null;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  country: string;
  isVatPayer: boolean;
  preferredLanguage: string;
  website: string | null;
  email: string | null;
  phone: string | null;
  description: string | null;
  categories: string[];
  connectionStrength: ConnectionStrength | null;
  estimatedRevenueRange: string | null;
  teamMembers: TeamMemberRef[];
}

export interface SocialLink {
  platform: string;
  url: string;
}

export interface Contact {
  id: string;
  contactCode: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  position: string | null;
  companyId: string | null;
  socialLinks: SocialLink[] | null;
}

export type DealStatus = 'proposal' | 'negotiation' | 'closed_won' | 'closed_lost';
export type Priority = 'low' | 'medium' | 'high';

export interface Deal {
  id: string;
  dealCode: string;
  title: string;
  contactId: string | null;
  companyId: string | null;
  totalValue: string;
  currency: string;
  status: DealStatus;
  priority: Priority;
  dealDate: string;
  expectedCloseDate: string | null;
  discountPercent: string | null;
  paymentMethod: string | null;
  invoiceId: string | null;
}

export type TaskStatus = 'pending' | 'in_progress' | 'done';

export interface Task {
  id: string;
  title: string;
  description: string | null;
  dueAt: string | null;
  priority: Priority;
  status: TaskStatus;
  companyId: string | null;
  contactId: string | null;
  dealId: string | null;
  assignees: TeamMemberRef[];
}

export interface Note {
  id: string;
  title: string;
  content: string | null;
  category: string | null;
  priority: Priority;
  status: TaskStatus;
  dueAt: string | null;
  isFavorite: boolean;
  companyId: string | null;
  contactId: string | null;
  dealId: string | null;
  assignees: TeamMemberRef[];
  createdAt: string;
}
