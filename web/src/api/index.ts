import { apiFetch } from './client';
import { ApiError } from './client';
import type {
  Company,
  CurrentUserInfo,
  Contact,
  ConnectionStrength,
  CreateInvoicePayload,
  Deal,
  DealStatus,
  DocumentType,
  Invoice,
  InvoiceSeries,
  Note,
  Priority,
  Product,
  SocialLink,
  Task,
  TaxType,
  UserRef,
} from './types';

export const AuthApi = {
  login: (email: string, password: string) =>
    apiFetch<{ accessToken: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  me: () => apiFetch<CurrentUserInfo>('/auth/me'),
};

export const UsersApi = {
  // GET /users e restricționat la owner/admin (rol global, vezi
  // UsersController) — un crm:agent obișnuit primește 403. Pickerele de
  // echipă/asignare tratează asta ca „nicio opțiune", nu ca eroare de
  // pagină (vezi CompanyFormDialog/TaskFormDialog din web/src/pages/crm/).
  list: async (): Promise<UserRef[]> => {
    try {
      return await apiFetch<UserRef[]>('/users');
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) return [];
      throw err;
    }
  },
};

// q e trimis ca query param — backend-ul îl folosește pentru o căutare
// case-insensitive pe nume/cod (vezi *.service.ts findAll).
function withQuery(path: string, q?: string): string {
  return q ? `${path}?q=${encodeURIComponent(q)}` : path;
}

// ── CRM ("Clienți" în UI) — înlocuiește fostul CustomersApi ─────────────

// address/postalCode/city/website/email/phone/description acceptă `null`
// explicit (golește câmpul — `@IsOptional()` din backend tratează `null` la
// fel ca `undefined`, sare peste restul validatorilor) chiar și la create
// (fără efect practic acolo, dar tipul rămâne unul singur, refolosit și de
// update). `undefined` înseamnă „neschimbat" la update — JSON.stringify
// elimină cheia din body. Vezi fix logic-reviewer aplicat inițial pe fosta
// pagină „Clienți".
export interface CreateCompanyPayload {
  name: string;
  taxId?: string;
  address?: string | null;
  postalCode?: string | null;
  city?: string | null;
  country?: string;
  isVatPayer?: boolean;
  preferredLanguage?: string;
  website?: string | null;
  email?: string | null;
  phone?: string | null;
  description?: string | null;
  categories?: string[];
  connectionStrength?: ConnectionStrength;
  estimatedRevenueRange?: string;
  teamUserIds?: string[];
}

export type UpdateCompanyPayload = CreateCompanyPayload;

export const CompaniesApi = {
  list: (q?: string) => apiFetch<Company[]>(withQuery('/companies', q)),
  get: (id: string) => apiFetch<Company>(`/companies/${id}`),
  create: (dto: CreateCompanyPayload) =>
    apiFetch<Company>('/companies', { method: 'POST', body: JSON.stringify(dto) }),
  update: (id: string, dto: UpdateCompanyPayload) =>
    apiFetch<Company>(`/companies/${id}`, { method: 'PATCH', body: JSON.stringify(dto) }),
  remove: (id: string) => apiFetch<{ ok: true }>(`/companies/${id}`, { method: 'DELETE' }),
};

export interface CreateContactPayload {
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  position?: string | null;
  companyId?: string | null;
  socialLinks?: SocialLink[];
}

export type UpdateContactPayload = CreateContactPayload;

export const ContactsApi = {
  list: (q?: string) => apiFetch<Contact[]>(withQuery('/contacts', q)),
  get: (id: string) => apiFetch<Contact>(`/contacts/${id}`),
  create: (dto: CreateContactPayload) =>
    apiFetch<Contact>('/contacts', { method: 'POST', body: JSON.stringify(dto) }),
  update: (id: string, dto: UpdateContactPayload) =>
    apiFetch<Contact>(`/contacts/${id}`, { method: 'PATCH', body: JSON.stringify(dto) }),
  remove: (id: string) => apiFetch<{ ok: true }>(`/contacts/${id}`, { method: 'DELETE' }),
};

export interface CreateDealPayload {
  title: string;
  contactId?: string | null;
  companyId?: string | null;
  totalValue: number;
  currency?: string;
  status?: DealStatus;
  priority?: Priority;
  dealDate: string;
  expectedCloseDate?: string | null;
  discountPercent?: number;
  paymentMethod?: string | null;
  invoiceId?: string | null;
}

export type UpdateDealPayload = Partial<CreateDealPayload>;

export const DealsApi = {
  list: (q?: string) => apiFetch<Deal[]>(withQuery('/deals', q)),
  get: (id: string) => apiFetch<Deal>(`/deals/${id}`),
  create: (dto: CreateDealPayload) =>
    apiFetch<Deal>('/deals', { method: 'POST', body: JSON.stringify(dto) }),
  update: (id: string, dto: UpdateDealPayload) =>
    apiFetch<Deal>(`/deals/${id}`, { method: 'PATCH', body: JSON.stringify(dto) }),
  remove: (id: string) => apiFetch<{ ok: true }>(`/deals/${id}`, { method: 'DELETE' }),
};

export interface CreateTaskPayload {
  title: string;
  description?: string | null;
  dueAt?: string | null;
  priority?: Priority;
  status?: 'pending' | 'in_progress' | 'done';
  companyId?: string | null;
  contactId?: string | null;
  dealId?: string | null;
  assigneeUserIds?: string[];
}

export type UpdateTaskPayload = Partial<CreateTaskPayload>;

export const TasksApi = {
  list: (q?: string) => apiFetch<Task[]>(withQuery('/tasks', q)),
  get: (id: string) => apiFetch<Task>(`/tasks/${id}`),
  create: (dto: CreateTaskPayload) =>
    apiFetch<Task>('/tasks', { method: 'POST', body: JSON.stringify(dto) }),
  update: (id: string, dto: UpdateTaskPayload) =>
    apiFetch<Task>(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(dto) }),
  remove: (id: string) => apiFetch<{ ok: true }>(`/tasks/${id}`, { method: 'DELETE' }),
};

export interface CreateNotePayload {
  title: string;
  content?: string | null;
  category?: string | null;
  priority?: Priority;
  status?: 'pending' | 'in_progress' | 'done';
  dueAt?: string | null;
  isFavorite?: boolean;
  companyId?: string | null;
  contactId?: string | null;
  dealId?: string | null;
  assigneeUserIds?: string[];
}

export type UpdateNotePayload = Partial<CreateNotePayload>;

export const NotesApi = {
  list: (q?: string) => apiFetch<Note[]>(withQuery('/notes', q)),
  get: (id: string) => apiFetch<Note>(`/notes/${id}`),
  create: (dto: CreateNotePayload) =>
    apiFetch<Note>('/notes', { method: 'POST', body: JSON.stringify(dto) }),
  update: (id: string, dto: UpdateNotePayload) =>
    apiFetch<Note>(`/notes/${id}`, { method: 'PATCH', body: JSON.stringify(dto) }),
  remove: (id: string) => apiFetch<{ ok: true }>(`/notes/${id}`, { method: 'DELETE' }),
};

// ── Facturare ─────────────────────────────────────────────────────────

// productCode NU apare aici, deliberat — alocat automat de backend
// (CodeSequenceService), niciodată tastat de utilizator.
export interface CreateProductPayload {
  description: string;
  unitOfMeasure: string;
  defaultTaxType: TaxType;
  unitPrice?: number;
  revenueAccount: string;
}

// unitPrice acceptă `null` explicit (golește prețul — vezi comentariul
// echivalent din CreateCompanyPayload despre address/postalCode/city).
export type UpdateProductPayload = Omit<CreateProductPayload, 'unitPrice'> & {
  unitPrice?: number | null;
};

export const ProductsApi = {
  list: (q?: string) => apiFetch<Product[]>(withQuery('/products', q)),
  create: (dto: CreateProductPayload) =>
    apiFetch<Product>('/products', { method: 'POST', body: JSON.stringify(dto) }),
  update: (id: string, dto: UpdateProductPayload) =>
    apiFetch<Product>(`/products/${id}`, { method: 'PATCH', body: JSON.stringify(dto) }),
  remove: (id: string) => apiFetch<{ ok: true }>(`/products/${id}`, { method: 'DELETE' }),
};

export const InvoiceSeriesApi = {
  list: (q?: string) => apiFetch<InvoiceSeries[]>(withQuery('/invoice-series', q)),
  create: (dto: { seriesCode: string; documentType: DocumentType }) =>
    apiFetch<InvoiceSeries>('/invoice-series', { method: 'POST', body: JSON.stringify(dto) }),
  // Deliberat fără update() — vezi InvoiceSeriesService (backend): nici
  // seriesCode/documentType, nici nextNumber nu se pot edita după creare.
  remove: (id: string) => apiFetch<{ ok: true }>(`/invoice-series/${id}`, { method: 'DELETE' }),
};

export const InvoicesApi = {
  list: () => apiFetch<Invoice[]>('/invoices'),
  get: (id: string) => apiFetch<Invoice>(`/invoices/${id}`),
  create: (dto: CreateInvoicePayload) =>
    apiFetch<Invoice>('/invoices', { method: 'POST', body: JSON.stringify(dto) }),
  issue: (id: string) => apiFetch<Invoice>(`/invoices/${id}/issue`, { method: 'POST' }),
};
