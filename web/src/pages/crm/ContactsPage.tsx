import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import { CompaniesApi, ContactsApi } from '../../api';
import { ApiError } from '../../api/client';
import type { Company, Contact, SocialLink } from '../../api/types';
import { useListPage } from '../../hooks/use-list-page';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Card, CardTable } from '@/components/ui/card';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { DeleteConfirmDialog } from '@/components/delete-confirm-dialog';
import { ListPagination } from '@/components/list-pagination';
import { RowActions } from '@/components/row-actions';
import {
  Toolbar,
  ToolbarActions,
  ToolbarDescription,
  ToolbarHeading,
  ToolbarPageTitle,
} from '@/components/toolbar';

// Tab-uri Leads/Follow-ups/Pipeline (ca-n demo) — filtre client-side pe
// aceeași listă (nu 3 endpoint-uri separate): „Leads" = fără companie
// asignată, „Pipeline" = cu companie, „Follow-ups" = toate (nu avem încă
// un concept real de „urmărire" separat, vezi docs/crm-spec.md pentru
// extindere ulterioară).
type ContactTab = 'leads' | 'followups' | 'pipeline';

function toErrorMessage(err: unknown): string {
  return err instanceof ApiError
    ? err.status === 403
      ? 'Nu ai acces la modulul Clienți (entitlement/rol lipsă).'
      : err.message
    : 'Eroare la încărcarea contactelor.';
}

export function ContactsPage() {
  const {
    items: contacts,
    error,
    search,
    setSearch,
    page,
    setPage,
    pageSize,
    setPageSize,
    pageItems,
    reload,
  } = useListPage<Contact>((q) => ContactsApi.list(q), toErrorMessage);
  const [tab, setTab] = useState<ContactTab>('leads');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [deleting, setDeleting] = useState<Contact | null>(null);

  const filtered = (contacts ?? []).filter((c) =>
    tab === 'leads' ? !c.companyId : tab === 'pipeline' ? !!c.companyId : true,
  );
  const filteredPageItems = pageItems.filter((c) =>
    filtered.some((f) => f.id === c.id),
  );

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
            <BreadcrumbPage>Contacte</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <Toolbar>
        <ToolbarHeading>
          <ToolbarPageTitle>Contacte</ToolbarPageTitle>
          <ToolbarDescription>
            {contacts ? `${contacts.length} contacte găsite` : 'Se încarcă…'}
          </ToolbarDescription>
        </ToolbarHeading>
        <ToolbarActions>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Caută după nume sau email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-64 pl-8"
            />
          </div>
          <Button
            variant="primary"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            + Adaugă contact
          </Button>
        </ToolbarActions>
      </Toolbar>

      <Tabs value={tab} onValueChange={(v) => setTab(v as ContactTab)} className="mb-4">
        <TabsList variant="line">
          <TabsTrigger value="leads">Leads</TabsTrigger>
          <TabsTrigger value="followups">Follow-ups</TabsTrigger>
          <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
        </TabsList>
      </Tabs>

      {error && (
        <p className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {!error && contacts !== null && filtered.length === 0 && (
        <Card>
          <div className="p-10 text-center text-sm text-muted-foreground">
            Niciun contact aici încă.
          </div>
        </Card>
      )}

      {!error && contacts !== null && filtered.length > 0 && (
        <Card>
          <CardTable>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nume</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Adresă</TableHead>
                  <TableHead>Rețele sociale</TableHead>
                  <TableHead>Telefon</TableHead>
                  <TableHead>Poziție</TableHead>
                  <TableHead className="text-right">Acțiuni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPageItems.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="text-muted-foreground">{c.email ?? '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{c.address ?? '—'}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {c.socialLinks && c.socialLinks.length > 0
                        ? c.socialLinks.map((s) => s.platform).join(', ')
                        : '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{c.phone ?? '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{c.position ?? '—'}</TableCell>
                    <TableCell className="text-right">
                      <RowActions
                        onEdit={() => {
                          setEditing(c);
                          setFormOpen(true);
                        }}
                        onDelete={() => setDeleting(c)}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardTable>
          <ListPagination
            page={page}
            pageSize={pageSize}
            total={filtered.length}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </Card>
      )}

      <ContactFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        contact={editing}
        onSaved={() => void reload()}
      />

      {deleting && (
        <DeleteConfirmDialog
          open={!!deleting}
          onOpenChange={(open) => !open && setDeleting(null)}
          title={`Ștergi contactul „${deleting.name}"?`}
          description="Acțiunea nu poate fi anulată."
          onConfirm={async () => {
            await ContactsApi.remove(deleting.id);
            await reload();
          }}
        />
      )}
    </div>
  );
}

function ContactFormDialog({
  open,
  onOpenChange,
  contact,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact: Contact | null;
  onSaved: () => void;
}) {
  const isEdit = !!contact;
  const [companies, setCompanies] = useState<Company[]>([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [position, setPosition] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [socialLinksText, setSocialLinksText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      void CompaniesApi.list().then(setCompanies);
      setName(contact?.name ?? '');
      setEmail(contact?.email ?? '');
      setPhone(contact?.phone ?? '');
      setAddress(contact?.address ?? '');
      setPosition(contact?.position ?? '');
      setCompanyId(contact?.companyId ?? '');
      setSocialLinksText(
        (contact?.socialLinks ?? []).map((s) => `${s.platform}:${s.url}`).join(', '),
      );
      setError(null);
    }
  }, [open, contact]);

  function parseSocialLinks(): SocialLink[] {
    return socialLinksText
      .split(',')
      .map((chunk) => chunk.trim())
      .filter(Boolean)
      .map((chunk) => {
        const [platform, ...rest] = chunk.split(':');
        return { platform: platform.trim(), url: rest.join(':').trim() || platform.trim() };
      })
      .filter((s) => s.platform);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      // Câmpurile golite trimit `null` explicit (nu `undefined`) — vezi
      // convenția din `CreateCompanyPayload`/`CompaniesPage.tsx`: `null`
      // golește efectiv câmpul la editare, `undefined` ar însemna
      // „neschimbat" (JSON.stringify elimină cheia din body) — fix
      // logic-reviewer, aceeași regresie deja reparată pe fosta pagină
      // Clienți.
      const payload = {
        name,
        email: email || null,
        phone: phone || null,
        address: address || null,
        position: position || null,
        companyId: companyId || null,
        socialLinks: parseSocialLinks(),
      };
      if (isEdit && contact) {
        await ContactsApi.update(contact.id, payload);
      } else {
        await ContactsApi.create(payload);
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editează contact' : 'Contact nou'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <DialogBody className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="name">Nume</Label>
                <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="position">Poziție</Label>
                <Input id="position" value={position} onChange={(e) => setPosition(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">Telefon</Label>
                <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="address">Adresă</Label>
              <Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Companie</Label>
              <Select value={companyId || '__none__'} onValueChange={(v) => setCompanyId(v === '__none__' ? '' : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="— fără companie (lead) —" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— fără companie (lead) —</SelectItem>
                  {companies.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="socialLinks">Rețele sociale (platformă:url, separate prin virgulă)</Label>
              <Input
                id="socialLinks"
                placeholder="LinkedIn:https://linkedin.com/in/..., Instagram:..."
                value={socialLinksText}
                onChange={(e) => setSocialLinksText(e.target.value)}
              />
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
