import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import { CompaniesApi } from '../../api';
import { ApiError } from '../../api/client';
import type { Company, ConnectionStrength } from '../../api/types';
import { useListPage } from '../../hooks/use-list-page';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardTable } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { DeleteConfirmDialog } from '@/components/delete-confirm-dialog';
import { ListPagination } from '@/components/list-pagination';
import { RowActions } from '@/components/row-actions';
import { UserMultiSelect } from '@/components/user-multi-select';
import {
  Toolbar,
  ToolbarActions,
  ToolbarDescription,
  ToolbarHeading,
  ToolbarPageTitle,
} from '@/components/toolbar';

const CONNECTION_STRENGTHS: ConnectionStrength[] = [
  'very_weak',
  'weak',
  'medium',
  'strong',
  'very_strong',
];

const CONNECTION_LABEL: Record<ConnectionStrength, string> = {
  very_weak: 'Foarte slabă',
  weak: 'Slabă',
  medium: 'Medie',
  strong: 'Puternică',
  very_strong: 'Foarte puternică',
};

const CONNECTION_VARIANT: Record<ConnectionStrength, 'destructive' | 'warning' | 'info' | 'success'> = {
  very_weak: 'destructive',
  weak: 'destructive',
  medium: 'warning',
  strong: 'info',
  very_strong: 'success',
};

function toErrorMessage(err: unknown): string {
  return err instanceof ApiError
    ? err.status === 403
      ? 'Nu ai acces la modulul Clienți (entitlement/rol lipsă).'
      : err.message
    : 'Eroare la încărcarea companiilor.';
}

export function CompaniesPage() {
  const {
    items: companies,
    error,
    search,
    setSearch,
    page,
    setPage,
    pageSize,
    setPageSize,
    pageItems,
    reload,
  } = useListPage<Company>((q) => CompaniesApi.list(q), toErrorMessage);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Company | null>(null);
  const [deleting, setDeleting] = useState<Company | null>(null);

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
            <BreadcrumbPage>Companii</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <Toolbar>
        <ToolbarHeading>
          <ToolbarPageTitle>Companii</ToolbarPageTitle>
          <ToolbarDescription>
            {companies ? `${companies.length} companii găsite` : 'Se încarcă…'}
          </ToolbarDescription>
        </ToolbarHeading>
        <ToolbarActions>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Caută după nume sau cod…"
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
            + Adaugă companie
          </Button>
        </ToolbarActions>
      </Toolbar>

      {error && (
        <p className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {!error && companies !== null && companies.length === 0 && (
        <Card>
          <div className="p-10 text-center text-sm text-muted-foreground">
            Nicio companie încă — apasă „+ Adaugă companie" ca să creezi una.
          </div>
        </Card>
      )}

      {!error && companies !== null && companies.length > 0 && (
        <Card>
          <CardTable>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Companie</TableHead>
                  <TableHead>Cod fiscal</TableHead>
                  <TableHead>Categorii</TableHead>
                  <TableHead>Echipă</TableHead>
                  <TableHead>Conexiune</TableHead>
                  <TableHead>Localitate</TableHead>
                  <TableHead>Venit estimat</TableHead>
                  <TableHead className="text-right">Acțiuni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageItems.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Link to={`/crm/companies/${c.id}`} className="font-medium hover:underline">
                        {c.name}
                      </Link>
                      <div className="font-mono text-xs text-muted-foreground">{c.companyCode}</div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{c.taxId ?? '—'}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {c.categories.length === 0 && <span className="text-muted-foreground">—</span>}
                        {c.categories.map((cat) => (
                          <Badge key={cat} variant="secondary" appearance="light" size="sm">
                            {cat}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {c.teamMembers.length === 0
                        ? '—'
                        : c.teamMembers.map((m) => m.user.fullName || m.user.email).join(', ')}
                    </TableCell>
                    <TableCell>
                      {c.connectionStrength ? (
                        <Badge variant={CONNECTION_VARIANT[c.connectionStrength]} appearance="light">
                          {CONNECTION_LABEL[c.connectionStrength]}
                        </Badge>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{c.city ?? '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{c.estimatedRevenueRange ?? '—'}</TableCell>
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
            total={companies.length}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </Card>
      )}

      <CompanyFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        company={editing}
        onSaved={() => void reload()}
      />

      {deleting && (
        <DeleteConfirmDialog
          open={!!deleting}
          onOpenChange={(open) => !open && setDeleting(null)}
          title={`Ștergi compania „${deleting.name}"?`}
          description="Acțiunea nu poate fi anulată. O companie folosită deja pe o factură nu poate fi ștearsă."
          onConfirm={async () => {
            await CompaniesApi.remove(deleting.id);
            await reload();
          }}
        />
      )}
    </div>
  );
}

function CompanyFormDialog({
  open,
  onOpenChange,
  company,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  company: Company | null;
  onSaved: () => void;
}) {
  const isEdit = !!company;
  const [name, setName] = useState('');
  const [taxId, setTaxId] = useState('');
  const [address, setAddress] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [city, setCity] = useState('');
  const [isVatPayer, setIsVatPayer] = useState(true);
  const [website, setWebsite] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [description, setDescription] = useState('');
  const [categoriesText, setCategoriesText] = useState('');
  const [connectionStrength, setConnectionStrength] = useState<ConnectionStrength | ''>('');
  const [estimatedRevenueRange, setEstimatedRevenueRange] = useState('');
  const [teamUserIds, setTeamUserIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(company?.name ?? '');
      setTaxId(company?.taxId ?? '');
      setAddress(company?.address ?? '');
      setPostalCode(company?.postalCode ?? '');
      setCity(company?.city ?? '');
      setIsVatPayer(company?.isVatPayer ?? true);
      setWebsite(company?.website ?? '');
      setEmail(company?.email ?? '');
      setPhone(company?.phone ?? '');
      setDescription(company?.description ?? '');
      setCategoriesText((company?.categories ?? []).join(', '));
      setConnectionStrength(company?.connectionStrength ?? '');
      setEstimatedRevenueRange(company?.estimatedRevenueRange ?? '');
      setTeamUserIds(company?.teamMembers.map((m) => m.userId) ?? []);
      setError(null);
    }
  }, [open, company]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const categories = categoriesText
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean);
      const payload = {
        name,
        address: address || null,
        postalCode: postalCode || null,
        city: city || null,
        isVatPayer,
        website: website || null,
        email: email || null,
        phone: phone || null,
        description: description || null,
        categories,
        connectionStrength: connectionStrength || undefined,
        estimatedRevenueRange: estimatedRevenueRange || undefined,
        teamUserIds,
      };
      if (isEdit && company) {
        // taxId trimis DOAR dacă s-a schimbat — vezi fix logic-reviewer
        // aplicat pe fosta pagină „Clienți" (evită revalidare ANAF inutilă).
        await CompaniesApi.update(company.id, {
          ...payload,
          ...(taxId !== (company.taxId ?? '') ? { taxId } : {}),
        });
      } else {
        await CompaniesApi.create({ ...payload, taxId: taxId || undefined });
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
          <DialogTitle>{isEdit ? 'Editează companie' : 'Companie nouă'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <DialogBody className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="name">Nume companie</Label>
                <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="taxId">Cod fiscal (CUI)</Label>
                <Input
                  id="taxId"
                  placeholder="validat prin ANAF"
                  value={taxId}
                  onChange={(e) => setTaxId(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="website">Website</Label>
                <Input id="website" value={website} onChange={(e) => setWebsite(e.target.value)} />
              </div>
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
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="city">Localitate</Label>
                <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="postalCode">Cod poștal</Label>
                <Input id="postalCode" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="description">Descriere</Label>
              <Textarea
                id="description"
                variant="sm"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="categories">Categorii (separate prin virgulă)</Label>
                <Input
                  id="categories"
                  placeholder="B2B, IT, Fintech"
                  value={categoriesText}
                  onChange={(e) => setCategoriesText(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Conexiune</Label>
                <Select
                  value={connectionStrength || '__none__'}
                  onValueChange={(v) =>
                    setConnectionStrength(v === '__none__' ? '' : (v as ConnectionStrength))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Nespecificat" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— nespecificat —</SelectItem>
                    {CONNECTION_STRENGTHS.map((s) => (
                      <SelectItem key={s} value={s}>
                        {CONNECTION_LABEL[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="estimatedRevenueRange">Venit estimat</Label>
              <Input
                id="estimatedRevenueRange"
                placeholder="ex: 100K-500K"
                value={estimatedRevenueRange}
                onChange={(e) => setEstimatedRevenueRange(e.target.value)}
              />
            </div>
            <UserMultiSelect label="Echipă" selectedIds={teamUserIds} onChange={setTeamUserIds} />
            <label className="flex items-center gap-2.5">
              <Checkbox
                checked={isVatPayer}
                onCheckedChange={(checked) => setIsVatPayer(checked === true)}
              />
              <span className="text-sm text-foreground">Plătitor de TVA</span>
            </label>
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
