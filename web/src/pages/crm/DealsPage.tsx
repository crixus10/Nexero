import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CompaniesApi, ContactsApi, DealsApi, InvoicesApi } from '../../api';
import { ApiError } from '../../api/client';
import type {
  Company,
  Contact,
  Deal,
  DealStatus,
  Invoice,
  Priority,
} from '../../api/types';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DeleteConfirmDialog } from '@/components/delete-confirm-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreVertical, Pencil, Trash2 } from 'lucide-react';
import {
  Toolbar,
  ToolbarActions,
  ToolbarDescription,
  ToolbarHeading,
  ToolbarPageTitle,
} from '@/components/toolbar';

type DealTab = 'active' | 'closed' | 'upcoming';

const STATUS_LABEL: Record<DealStatus, string> = {
  proposal: 'Proposal',
  negotiation: 'Negotiation',
  closed_won: 'Closed Won',
  closed_lost: 'Closed Lost',
};
const STATUS_VARIANT: Record<DealStatus, BadgeProps['variant']> = {
  proposal: 'warning',
  negotiation: 'info',
  closed_won: 'success',
  closed_lost: 'destructive',
};
const PRIORITY_LABEL: Record<Priority, string> = { low: 'Low', medium: 'Medium', high: 'High' };
const PRIORITY_VARIANT: Record<Priority, BadgeProps['variant']> = {
  low: 'secondary',
  medium: 'warning',
  high: 'destructive',
};
const DEAL_STATUSES: DealStatus[] = ['proposal', 'negotiation', 'closed_won', 'closed_lost'];
const PRIORITIES: Priority[] = ['low', 'medium', 'high'];

function toErrorMessage(err: unknown): string {
  return err instanceof ApiError
    ? err.status === 403
      ? 'Nu ai acces la modulul Clienți (entitlement/rol lipsă).'
      : err.message
    : 'Eroare la încărcarea deal-urilor.';
}

export function DealsPage() {
  const [deals, setDeals] = useState<Deal[] | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<DealTab>('active');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Deal | null>(null);
  const [deleting, setDeleting] = useState<Deal | null>(null);

  async function reload() {
    try {
      const [d, c, co] = await Promise.all([
        DealsApi.list(),
        ContactsApi.list(),
        CompaniesApi.list(),
      ]);
      setDeals(d);
      setContacts(c);
      setCompanies(co);
      setError(null);
    } catch (err) {
      setError(toErrorMessage(err));
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const filtered = (deals ?? []).filter((d) => {
    const isClosed = d.status === 'closed_won' || d.status === 'closed_lost';
    if (tab === 'closed') return isClosed;
    if (tab === 'upcoming') return !isClosed && !!d.expectedCloseDate && d.expectedCloseDate >= today;
    return !isClosed;
  });

  const contactById = new Map(contacts.map((c) => [c.id, c]));
  const companyById = new Map(companies.map((c) => [c.id, c]));

  return (
    <div className="container-fluid">
      <Breadcrumb className="mb-3">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/crm">Clienți</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Deal-uri</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <Toolbar>
        <ToolbarHeading>
          <ToolbarPageTitle>Deal-uri</ToolbarPageTitle>
          <ToolbarDescription>
            {deals ? `${deals.length} deal-uri găsite` : 'Se încarcă…'}
          </ToolbarDescription>
        </ToolbarHeading>
        <ToolbarActions>
          <Button
            variant="primary"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            + Adaugă deal
          </Button>
        </ToolbarActions>
      </Toolbar>

      <Tabs value={tab} onValueChange={(v) => setTab(v as DealTab)} className="mb-4">
        <TabsList variant="line">
          <TabsTrigger value="active">Active</TabsTrigger>
          <TabsTrigger value="closed">Closed</TabsTrigger>
          <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
        </TabsList>
      </Tabs>

      {error && (
        <p className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {!error && deals !== null && filtered.length === 0 && (
        <Card>
          <div className="p-10 text-center text-sm text-muted-foreground">
            Niciun deal aici încă.
          </div>
        </Card>
      )}

      {!error && filtered.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {filtered.map((deal) => {
            const contact = deal.contactId ? contactById.get(deal.contactId) : undefined;
            const company = deal.companyId ? companyById.get(deal.companyId) : undefined;
            return (
              <Card key={deal.id}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-center justify-between">
                    <Badge variant={PRIORITY_VARIANT[deal.priority]} appearance="light">
                      {PRIORITY_LABEL[deal.priority]}
                    </Badge>
                    <div className="flex items-center gap-1">
                      <Badge variant={STATUS_VARIANT[deal.status]} appearance="light">
                        {STATUS_LABEL[deal.status]}
                      </Badge>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" mode="icon" size="sm">
                            <MoreVertical />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onSelect={() => {
                              setEditing(deal);
                              setFormOpen(true);
                            }}
                          >
                            <Pencil /> Editează
                          </DropdownMenuItem>
                          <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(deal)}>
                            <Trash2 /> Șterge
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                  <div>
                    <div className="font-medium">{contact?.name ?? company?.name ?? deal.title}</div>
                    <div className="text-sm text-muted-foreground">{deal.title}</div>
                  </div>
                  <div className="text-lg font-semibold">
                    {deal.totalValue} {deal.currency}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {deal.dealDate.slice(0, 10)}
                  </div>
                  {deal.paymentMethod && (
                    <div className="text-sm text-muted-foreground">{deal.paymentMethod}</div>
                  )}
                  <div className="font-mono text-xs text-muted-foreground">{deal.dealCode}</div>
                  <div className="flex items-center justify-between">
                    {deal.discountPercent != null ? (
                      <span className="text-sm text-muted-foreground">
                        {deal.discountPercent}% discount
                      </span>
                    ) : (
                      <span />
                    )}
                    {deal.invoiceId && (
                      <Link
                        to={`/invoices`}
                        className="text-xs text-primary hover:underline"
                        title="Deal legat de o factură emisă"
                      >
                        Vezi factura
                      </Link>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <DealFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        deal={editing}
        contacts={contacts}
        companies={companies}
        onSaved={() => void reload()}
      />

      {deleting && (
        <DeleteConfirmDialog
          open={!!deleting}
          onOpenChange={(open) => !open && setDeleting(null)}
          title={`Ștergi deal-ul „${deleting.title}"?`}
          description="Acțiunea nu poate fi anulată."
          onConfirm={async () => {
            await DealsApi.remove(deleting.id);
            await reload();
          }}
        />
      )}
    </div>
  );
}

function DealFormDialog({
  open,
  onOpenChange,
  deal,
  contacts,
  companies,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deal: Deal | null;
  contacts: Contact[];
  companies: Company[];
  onSaved: () => void;
}) {
  const isEdit = !!deal;
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [title, setTitle] = useState('');
  const [contactId, setContactId] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [totalValue, setTotalValue] = useState('0');
  const [status, setStatus] = useState<DealStatus>('proposal');
  const [priority, setPriority] = useState<Priority>('medium');
  const [dealDate, setDealDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [expectedCloseDate, setExpectedCloseDate] = useState('');
  const [discountPercent, setDiscountPercent] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [invoiceId, setInvoiceId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      void InvoicesApi.list().then(setInvoices);
      setTitle(deal?.title ?? '');
      setContactId(deal?.contactId ?? '');
      setCompanyId(deal?.companyId ?? '');
      setTotalValue(deal?.totalValue ?? '0');
      setStatus(deal?.status ?? 'proposal');
      setPriority(deal?.priority ?? 'medium');
      setDealDate(deal?.dealDate.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
      setExpectedCloseDate(deal?.expectedCloseDate?.slice(0, 10) ?? '');
      setDiscountPercent(deal?.discountPercent ?? '');
      setPaymentMethod(deal?.paymentMethod ?? '');
      setInvoiceId(deal?.invoiceId ?? '');
      setError(null);
    }
  }, [open, deal]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      // `null` explicit golește câmpul la editare — vezi fix
      // logic-reviewer, CompaniesPage.tsx.
      const payload = {
        title,
        contactId: contactId || null,
        companyId: companyId || null,
        totalValue: Number(totalValue),
        status,
        priority,
        dealDate,
        expectedCloseDate: expectedCloseDate || null,
        discountPercent: discountPercent ? Number(discountPercent) : undefined,
        paymentMethod: paymentMethod || null,
        invoiceId: invoiceId || null,
      };
      if (isEdit && deal) {
        await DealsApi.update(deal.id, payload);
      } else {
        await DealsApi.create(payload);
      }
      onSaved();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Eroare la salvare.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editează deal' : 'Deal nou'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <DialogBody className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="title">Titlu</Label>
              <Input id="title" required value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Contact</Label>
                <Select value={contactId || '__none__'} onValueChange={(v) => setContactId(v === '__none__' ? '' : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="— fără contact —" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— fără contact —</SelectItem>
                    {contacts.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Companie</Label>
                <Select value={companyId || '__none__'} onValueChange={(v) => setCompanyId(v === '__none__' ? '' : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="— fără companie —" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— fără companie —</SelectItem>
                    {companies.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="totalValue">Valoare totală (RON)</Label>
                <Input
                  id="totalValue"
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={totalValue}
                  onChange={(e) => setTotalValue(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="discountPercent">Discount %</Label>
                <Input
                  id="discountPercent"
                  type="number"
                  min="0"
                  step="0.01"
                  value={discountPercent}
                  onChange={(e) => setDiscountPercent(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as DealStatus)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DEAL_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {STATUS_LABEL[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Prioritate</Label>
                <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((p) => (
                      <SelectItem key={p} value={p}>
                        {PRIORITY_LABEL[p]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="dealDate">Data deal</Label>
                <Input
                  id="dealDate"
                  type="date"
                  required
                  value={dealDate}
                  onChange={(e) => setDealDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="expectedCloseDate">Închidere estimată</Label>
                <Input
                  id="expectedCloseDate"
                  type="date"
                  value={expectedCloseDate}
                  onChange={(e) => setExpectedCloseDate(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="paymentMethod">Metodă de plată</Label>
              <Input
                id="paymentMethod"
                placeholder="Cash, Transfer bancar, Card…"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Factură legată (opțional)</Label>
              <Select value={invoiceId || '__none__'} onValueChange={(v) => setInvoiceId(v === '__none__' ? '' : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="— fără factură —" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— fără factură —</SelectItem>
                  {invoices.map((inv) => (
                    <SelectItem key={inv.id} value={inv.id}>
                      {inv.invoiceNo} ({inv.invoiceAmount} {inv.currency})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Anulează
            </Button>
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? 'Se salvează…' : 'Salvează'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
