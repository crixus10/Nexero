import { apiFetch } from './client';
import type {
  AuthenticatedUser,
  CreateInvoicePayload,
  Customer,
  DocumentType,
  Invoice,
  InvoiceSeries,
  Product,
  TaxType,
} from './types';

export const AuthApi = {
  login: (email: string, password: string) =>
    apiFetch<{ accessToken: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  me: () => apiFetch<AuthenticatedUser>('/auth/me'),
};

// q e trimis ca query param — backend-ul îl folosește pentru o căutare
// case-insensitive pe nume/cod (vezi *.service.ts findAll).
function withQuery(path: string, q?: string): string {
  return q ? `${path}?q=${encodeURIComponent(q)}` : path;
}

export interface CreateCustomerPayload {
  customerCode: string;
  name: string;
  taxId?: string;
  address?: string;
  postalCode?: string;
  city?: string;
  country?: string;
  isVatPayer?: boolean;
  preferredLanguage?: string;
}

// address/postalCode/city acceptă `null` explicit (golește câmpul — coloana
// e nullable, iar `@IsOptional()` din backend tratează `null` la fel ca
// `undefined`: sare peste restul validatorilor). `undefined` înseamnă
// „neschimbat" — JSON.stringify elimină cheia din body, deci
// CustomersService.update nu-l atinge. Fără această distincție, golirea
// unui câmp din formular era un no-op silențios (fix logic-reviewer).
export type UpdateCustomerPayload = Omit<
  CreateCustomerPayload,
  'customerCode' | 'address' | 'postalCode' | 'city'
> & {
  address?: string | null;
  postalCode?: string | null;
  city?: string | null;
};

export const CustomersApi = {
  list: (q?: string) => apiFetch<Customer[]>(withQuery('/customers', q)),
  create: (dto: CreateCustomerPayload) =>
    apiFetch<Customer>('/customers', { method: 'POST', body: JSON.stringify(dto) }),
  update: (id: string, dto: UpdateCustomerPayload) =>
    apiFetch<Customer>(`/customers/${id}`, { method: 'PATCH', body: JSON.stringify(dto) }),
  remove: (id: string) => apiFetch<{ ok: true }>(`/customers/${id}`, { method: 'DELETE' }),
};

export interface CreateProductPayload {
  productCode: string;
  description: string;
  unitOfMeasure: string;
  defaultTaxType: TaxType;
  unitPrice?: number;
  revenueAccount: string;
}

// unitPrice acceptă `null` explicit (golește prețul — vezi comentariul
// echivalent din UpdateCustomerPayload despre address/postalCode/city).
export type UpdateProductPayload = Omit<CreateProductPayload, 'productCode' | 'unitPrice'> & {
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
