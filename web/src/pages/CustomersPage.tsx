import { FormEvent, useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { CustomersApi } from '../api';
import { ApiError } from '../api/client';
import type { Customer } from '../api/types';
import { useListPage } from '../hooks/use-list-page';
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

function toErrorMessage(err: unknown): string {
  return err instanceof ApiError
    ? err.status === 403
      ? 'Nu ai acces la modulul Facturare (entitlement/rol lipsă).'
      : err.message
    : 'Eroare la încărcarea clienților.';
}

export function CustomersPage() {
  const {
    items: customers,
    error,
    search,
    setSearch,
    page,
    setPage,
    pageSize,
    setPageSize,
    pageItems,
    reload,
  } = useListPage<Customer>((q) => CustomersApi.list(q), toErrorMessage);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [deleting, setDeleting] = useState<Customer | null>(null);

  return (
    <div className="container-fluid">
      <Breadcrumb className="mb-3">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink>Nomenclatoare</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Clienți</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <Toolbar>
        <ToolbarHeading>
          <ToolbarPageTitle>Clienți</ToolbarPageTitle>
          <ToolbarDescription>
            {customers ? `${customers.length} clienți găsiți` : 'Se încarcă…'}
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
            + Adaugă client
          </Button>
        </ToolbarActions>
      </Toolbar>

      {error && (
        <p className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {!error && customers !== null && customers.length === 0 && (
        <Card>
          <div className="p-10 text-center text-sm text-muted-foreground">
            Niciun client încă — apasă „+ Adaugă client" ca să creezi unul.
          </div>
        </Card>
      )}

      {!error && customers !== null && customers.length > 0 && (
        <Card>
          <CardTable>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cod</TableHead>
                  <TableHead>Nume</TableHead>
                  <TableHead>CUI</TableHead>
                  <TableHead>Localitate</TableHead>
                  <TableHead>TVA</TableHead>
                  <TableHead className="text-right">Acțiuni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageItems.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono">{c.customerCode}</TableCell>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="text-muted-foreground">{c.taxId ?? '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{c.city ?? '—'}</TableCell>
                    <TableCell>
                      <Badge variant={c.isVatPayer ? 'success' : 'secondary'} appearance="light">
                        {c.isVatPayer ? 'Plătitor' : 'Neplătitor'}
                      </Badge>
                    </TableCell>
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
            total={customers.length}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </Card>
      )}

      <CustomerFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        customer={editing}
        onSaved={() => void reload()}
      />

      {deleting && (
        <DeleteConfirmDialog
          open={!!deleting}
          onOpenChange={(open) => !open && setDeleting(null)}
          title={`Ștergi clientul „${deleting.name}"?`}
          description="Acțiunea nu poate fi anulată. Un client folosit deja pe o factură nu poate fi șters."
          onConfirm={async () => {
            await CustomersApi.remove(deleting.id);
            await reload();
          }}
        />
      )}
    </div>
  );
}

function CustomerFormDialog({
  open,
  onOpenChange,
  customer,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: Customer | null;
  onSaved: () => void;
}) {
  const isEdit = !!customer;
  const [customerCode, setCustomerCode] = useState('');
  const [name, setName] = useState('');
  const [taxId, setTaxId] = useState('');
  const [address, setAddress] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [city, setCity] = useState('');
  const [isVatPayer, setIsVatPayer] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setCustomerCode(customer?.customerCode ?? '');
      setName(customer?.name ?? '');
      setTaxId(customer?.taxId ?? '');
      setAddress(customer?.address ?? '');
      setPostalCode(customer?.postalCode ?? '');
      setCity(customer?.city ?? '');
      setIsVatPayer(customer?.isVatPayer ?? true);
      setError(null);
    }
  }, [open, customer]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      if (isEdit && customer) {
        // taxId trimis DOAR dacă s-a schimbat față de valoarea inițială —
        // altfel fiecare editare (chiar și a orașului) ar re-declanșa
        // validarea live prin ANAF în CustomersService.update (fix
        // logic-reviewer: ANAF picat/rate-limited ar bloca orice editare).
        // address/postalCode/city trimise ca `null` explicit când sunt
        // golite (nu `undefined`, care ar însemna „neschimbat" pentru
        // Prisma updateMany — un gol silențios, fără nicio eroare).
        await CustomersApi.update(customer.id, {
          name,
          ...(taxId !== (customer.taxId ?? '') ? { taxId } : {}),
          address: address || null,
          postalCode: postalCode || null,
          city: city || null,
          isVatPayer,
        });
      } else {
        await CustomersApi.create({
          customerCode,
          name,
          taxId: taxId || undefined,
          address: address || undefined,
          postalCode: postalCode || undefined,
          city: city || undefined,
          isVatPayer,
        });
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
          <DialogTitle>{isEdit ? 'Editează client' : 'Client nou'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <DialogBody className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="customerCode">Cod client</Label>
                <Input
                  id="customerCode"
                  required
                  disabled={isEdit}
                  value={customerCode}
                  onChange={(e) => setCustomerCode(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="taxId">CUI</Label>
                <Input
                  id="taxId"
                  placeholder="validat prin ANAF"
                  value={taxId}
                  onChange={(e) => setTaxId(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="name">Nume</Label>
              <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
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
                <Input
                  id="postalCode"
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                />
              </div>
            </div>
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
