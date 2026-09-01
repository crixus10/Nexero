import { FormEvent, useEffect, useState } from 'react';
import { CustomersApi, InvoiceSeriesApi, InvoicesApi, ProductsApi } from '../api';
import { ApiError } from '../api/client';
import type {
  CreateInvoiceLinePayload,
  Customer,
  Invoice,
  InvoiceSeries,
  Product,
  TaxType,
} from '../api/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Toolbar, ToolbarHeading, ToolbarPageTitle, ToolbarDescription } from '@/components/toolbar';

interface LineDraft {
  productId: string;
  description: string;
  quantity: string;
  unitOfMeasure: string;
  unitPrice: string;
}

function emptyLine(): LineDraft {
  return { productId: '', description: '', quantity: '1', unitOfMeasure: 'buc', unitPrice: '0' };
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

export function NewInvoicePage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [series, setSeries] = useState<InvoiceSeries[]>([]);
  const [loadingLists, setLoadingLists] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [customerId, setCustomerId] = useState('');
  const [seriesCode, setSeriesCode] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(today());
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [issuing, setIssuing] = useState(false);
  const [issueError, setIssueError] = useState<string | null>(null);

  async function reloadLists() {
    setLoadingLists(true);
    setListError(null);
    try {
      const [c, p, s] = await Promise.all([
        CustomersApi.list(),
        ProductsApi.list(),
        InvoiceSeriesApi.list(),
      ]);
      setCustomers(c);
      setProducts(p);
      setSeries(s);
      setCustomerId((prev) => prev || c[0]?.id || '');
      setSeriesCode((prev) => prev || s[0]?.seriesCode || '');
    } catch (err) {
      setListError(
        err instanceof ApiError && err.status === 403
          ? 'Nu ai acces la modulul Facturare (entitlement/rol lipsă) — vezi nota din prisma/seed.ts.'
          : errorMessage(err, 'Eroare la încărcarea clienților/produselor/seriilor.'),
      );
    } finally {
      setLoadingLists(false);
    }
  }

  useEffect(() => {
    void reloadLists();
  }, []);

  function updateLine(index: number, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  function onProductChange(index: number, productId: string) {
    const product = products.find((p) => p.id === productId);
    updateLine(index, {
      productId,
      description: product?.description ?? '',
      unitOfMeasure: product?.unitOfMeasure ?? 'buc',
      unitPrice: product?.unitPrice ?? '0',
    });
  }

  function addLine() {
    setLines((prev) => [...prev, emptyLine()]);
  }

  function removeLine(index: number) {
    setLines((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setSubmitting(true);
    try {
      const payload: {
        seriesCode: string;
        customerId: string;
        invoiceDate: string;
        lines: CreateInvoiceLinePayload[];
      } = {
        seriesCode,
        customerId,
        invoiceDate,
        lines: lines.map((l) => ({
          productId: l.productId || undefined,
          description: l.description,
          quantity: Number(l.quantity),
          unitOfMeasure: l.unitOfMeasure,
          unitPrice: Number(l.unitPrice),
        })),
      };
      const created = await InvoicesApi.create(payload);
      setInvoice(created);
    } catch (err) {
      setSubmitError(errorMessage(err, 'Eroare la crearea facturii.'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleIssue() {
    if (!invoice) return;
    setIssueError(null);
    setIssuing(true);
    try {
      const issued = await InvoicesApi.issue(invoice.id);
      setInvoice(issued);
    } catch (err) {
      setIssueError(errorMessage(err, 'Eroare la emiterea facturii.'));
    } finally {
      setIssuing(false);
    }
  }

  function startOver() {
    setInvoice(null);
    setLines([emptyLine()]);
  }

  if (invoice) {
    return (
      <div className="container-fluid max-w-xl">
        <Toolbar>
          <ToolbarHeading>
            <ToolbarPageTitle>Factură {invoice.invoiceNo}</ToolbarPageTitle>
          </ToolbarHeading>
        </Toolbar>
        <Card>
          <CardContent className="p-5">
            <dl className="grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Status</dt>
              <dd className="font-medium">
                <Badge variant={invoice.status === 'issued' ? 'success' : 'secondary'} appearance="light">
                  {invoice.status}
                </Badge>
              </dd>
              <dt className="text-muted-foreground">e-Factura</dt>
              <dd>{invoice.eInvoiceStatus ?? '—'}</dd>
              <dt className="text-muted-foreground">Total</dt>
              <dd className="font-medium">
                {invoice.invoiceAmount} {invoice.currency}
              </dd>
            </dl>
            <Separator className="my-4" />
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Descriere</TableHead>
                  <TableHead className="text-right">Cant.</TableHead>
                  <TableHead className="text-right">Preț unitar</TableHead>
                  <TableHead className="text-right">Valoare</TableHead>
                  <TableHead className="text-right">TVA</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoice.lines.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>{l.description}</TableCell>
                    <TableCell className="text-right">
                      {l.quantity} {l.unitOfMeasure}
                    </TableCell>
                    <TableCell className="text-right">{l.unitPrice}</TableCell>
                    <TableCell className="text-right">{l.lineAmount}</TableCell>
                    <TableCell className="text-right">{l.taxAmount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {issueError && (
              <p className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {issueError}
              </p>
            )}

            <div className="mt-5 flex gap-2">
              {invoice.status === 'draft' && (
                <Button variant="primary" onClick={handleIssue} disabled={issuing}>
                  {issuing ? 'Se emite…' : 'Emite factura (draft → issued)'}
                </Button>
              )}
              <Button variant="outline" onClick={startOver}>
                + Altă factură de test
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container-fluid max-w-2xl">
      <Toolbar>
        <ToolbarHeading>
          <ToolbarPageTitle>Factură nouă (test)</ToolbarPageTitle>
          <ToolbarDescription>
            Fluxul complet — client, serie, linii, emitere — direct contra API-ului real.
          </ToolbarDescription>
        </ToolbarHeading>
      </Toolbar>

      {listError && (
        <p className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {listError}
        </p>
      )}
      {loadingLists && <p className="text-sm text-muted-foreground">Se încarcă…</p>}

      {!loadingLists && !listError && (
        <form onSubmit={handleSubmit} className="space-y-6">
          <CustomerPicker
            customers={customers}
            customerId={customerId}
            onChange={setCustomerId}
            onCreated={(c) => {
              setCustomers((prev) => [...prev, c]);
              setCustomerId(c.id);
            }}
          />

          <SeriesPicker
            series={series}
            seriesCode={seriesCode}
            onChange={setSeriesCode}
            onCreated={(s) => {
              setSeries((prev) => [...prev, s]);
              setSeriesCode(s.seriesCode);
            }}
          />

          <div className="space-y-1.5">
            <Label htmlFor="invoiceDate">Data facturii</Label>
            <Input
              id="invoiceDate"
              type="date"
              required
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
              className="w-auto"
            />
          </div>

          <LinesEditor
            lines={lines}
            products={products}
            onProductChange={onProductChange}
            onUpdateLine={updateLine}
            onAddLine={addLine}
            onRemoveLine={removeLine}
            onProductCreated={(p) => setProducts((prev) => [...prev, p])}
          />

          {submitError && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {submitError}
            </p>
          )}

          <Button
            type="submit"
            variant="primary"
            disabled={submitting || !customerId || !seriesCode}
          >
            {submitting ? 'Se creează…' : 'Creează factura (draft)'}
          </Button>
        </form>
      )}
    </div>
  );
}

function CustomerPicker({
  customers,
  customerId,
  onChange,
  onCreated,
}: {
  customers: Customer[];
  customerId: string;
  onChange: (id: string) => void;
  onCreated: (c: Customer) => void;
}) {
  const [showNew, setShowNew] = useState(customers.length === 0);
  const [customerCode, setCustomerCode] = useState('');
  const [name, setName] = useState('');
  const [taxId, setTaxId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const c = await CustomersApi.create({
        customerCode,
        name,
        taxId: taxId || undefined,
      });
      onCreated(c);
      setShowNew(false);
      setCustomerCode('');
      setName('');
      setTaxId('');
    } catch (err) {
      setError(errorMessage(err, 'Eroare la crearea clientului.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <Label className="text-sm font-medium text-foreground">Client</Label>
        {!showNew && (
          <div className="flex items-center gap-2">
            <Select value={customerId} onValueChange={onChange}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Alege un client" />
              </SelectTrigger>
              <SelectContent>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.customerCode} — {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" variant="outline" onClick={() => setShowNew(true)}>
              + Client nou
            </Button>
          </div>
        )}
        {showNew && (
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-2">
              <Input
                placeholder="Cod (ex: CL-001)"
                required
                value={customerCode}
                onChange={(e) => setCustomerCode(e.target.value)}
              />
              <Input
                placeholder="Nume firmă/persoană"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="col-span-2"
              />
            </div>
            <Input
              placeholder="CUI (opțional — validat prin ANAF dacă e dat)"
              value={taxId}
              onChange={(e) => setTaxId(e.target.value)}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-2">
              <Button type="button" variant="primary" size="sm" onClick={handleCreate} disabled={saving}>
                {saving ? 'Se salvează…' : 'Salvează clientul'}
              </Button>
              {customers.length > 0 && (
                <Button type="button" variant="outline" size="sm" onClick={() => setShowNew(false)}>
                  Anulează
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SeriesPicker({
  series,
  seriesCode,
  onChange,
  onCreated,
}: {
  series: InvoiceSeries[];
  seriesCode: string;
  onChange: (code: string) => void;
  onCreated: (s: InvoiceSeries) => void;
}) {
  const [showNew, setShowNew] = useState(series.length === 0);
  const [newCode, setNewCode] = useState('FACT');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const s = await InvoiceSeriesApi.create({ seriesCode: newCode, documentType: 'invoice' });
      onCreated(s);
      setShowNew(false);
    } catch (err) {
      setError(errorMessage(err, 'Eroare la crearea seriei.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <Label className="text-sm font-medium text-foreground">Serie facturare</Label>
        {!showNew && (
          <div className="flex items-center gap-2">
            <Select value={seriesCode} onValueChange={onChange}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Alege o serie" />
              </SelectTrigger>
              <SelectContent>
                {series.map((s) => (
                  <SelectItem key={s.id} value={s.seriesCode}>
                    {s.seriesCode} ({s.documentType}) — următorul nr. {s.nextNumber}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" variant="outline" onClick={() => setShowNew(true)}>
              + Serie nouă
            </Button>
          </div>
        )}
        {showNew && (
          <div className="space-y-2">
            <Input
              placeholder="Cod serie (ex: FACT)"
              required
              value={newCode}
              onChange={(e) => setNewCode(e.target.value)}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-2">
              <Button type="button" variant="primary" size="sm" onClick={handleCreate} disabled={saving}>
                {saving ? 'Se salvează…' : 'Salvează seria'}
              </Button>
              {series.length > 0 && (
                <Button type="button" variant="outline" size="sm" onClick={() => setShowNew(false)}>
                  Anulează
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const TAX_TYPES: TaxType[] = ['Standard', 'Reduced', 'Exempt'];

function QuickCreateProduct({ onCreated }: { onCreated: (p: Product) => void }) {
  const [open, setOpen] = useState(false);
  const [productCode, setProductCode] = useState('');
  const [description, setDescription] = useState('');
  const [unitOfMeasure, setUnitOfMeasure] = useState('buc');
  const [defaultTaxType, setDefaultTaxType] = useState<TaxType>('Standard');
  const [unitPrice, setUnitPrice] = useState('0');
  const [revenueAccount, setRevenueAccount] = useState('707');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const p = await ProductsApi.create({
        productCode,
        description,
        unitOfMeasure,
        defaultTaxType,
        unitPrice: unitPrice ? Number(unitPrice) : undefined,
        revenueAccount,
      });
      onCreated(p);
      setOpen(false);
      setProductCode('');
      setDescription('');
    } catch (err) {
      setError(errorMessage(err, 'Eroare la crearea produsului.'));
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <Button type="button" variant="dim" size="sm" onClick={() => setOpen(true)}>
        + Produs nou
      </Button>
    );
  }

  return (
    <Card>
      <CardContent className="p-3 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <Input
            placeholder="Cod produs"
            required
            value={productCode}
            onChange={(e) => setProductCode(e.target.value)}
          />
          <Input
            placeholder="Descriere"
            required
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <Input
            placeholder="U.M. (buc, ora, kg...)"
            required
            value={unitOfMeasure}
            onChange={(e) => setUnitOfMeasure(e.target.value)}
          />
          <Select value={defaultTaxType} onValueChange={(v) => setDefaultTaxType(v as TaxType)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TAX_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="number"
            step="0.01"
            placeholder="Preț unitar"
            value={unitPrice}
            onChange={(e) => setUnitPrice(e.target.value)}
          />
          <Input
            placeholder="Cont contabil (707)"
            required
            value={revenueAccount}
            onChange={(e) => setRevenueAccount(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Button type="button" variant="primary" size="sm" onClick={handleCreate} disabled={saving}>
            {saving ? 'Se salvează…' : 'Salvează produsul'}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
            Anulează
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function LinesEditor({
  lines,
  products,
  onProductChange,
  onUpdateLine,
  onAddLine,
  onRemoveLine,
  onProductCreated,
}: {
  lines: LineDraft[];
  products: Product[];
  onProductChange: (index: number, productId: string) => void;
  onUpdateLine: (index: number, patch: Partial<LineDraft>) => void;
  onAddLine: () => void;
  onRemoveLine: (index: number) => void;
  onProductCreated: (p: Product) => void;
}) {
  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <Label className="text-sm font-medium text-foreground">Linii factură</Label>
        <div className="space-y-3">
          {lines.map((line, index) => (
            <div key={index} className="rounded-md border border-border bg-muted/40 p-3">
              <div className="grid grid-cols-12 gap-2">
                <Select
                  value={line.productId || '__none__'}
                  onValueChange={(v) => onProductChange(index, v === '__none__' ? '' : v)}
                >
                  <SelectTrigger className="col-span-4">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— fără produs (linie liberă) —</SelectItem>
                    {products.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.productCode}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Descriere"
                  required
                  value={line.description}
                  onChange={(e) => onUpdateLine(index, { description: e.target.value })}
                  className="col-span-4"
                />
                <Input
                  type="number"
                  step="0.001"
                  min="0.001"
                  placeholder="Cant."
                  required
                  value={line.quantity}
                  onChange={(e) => onUpdateLine(index, { quantity: e.target.value })}
                  className="col-span-2"
                />
                <Input
                  type="number"
                  step="0.0001"
                  min="0"
                  placeholder="Preț"
                  required
                  value={line.unitPrice}
                  onChange={(e) => onUpdateLine(index, { unitPrice: e.target.value })}
                  className="col-span-2"
                />
              </div>
              <div className="mt-2 flex items-center justify-between">
                <Input
                  placeholder="U.M."
                  required
                  value={line.unitOfMeasure}
                  onChange={(e) => onUpdateLine(index, { unitOfMeasure: e.target.value })}
                  className="w-24"
                  variant="sm"
                />
                {lines.length > 1 && (
                  <Button
                    type="button"
                    variant="dim"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => onRemoveLine(index)}
                  >
                    Șterge linia
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between">
          <Button type="button" variant="dim" size="sm" onClick={onAddLine}>
            + Adaugă linie
          </Button>
          <QuickCreateProduct onCreated={onProductCreated} />
        </div>
      </CardContent>
    </Card>
  );
}
