import { FormEvent, useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { ProductsApi } from '../api';
import { ApiError } from '../api/client';
import type { Product, TaxType } from '../api/types';
import { useListPage } from '../hooks/use-list-page';
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

const TAX_TYPES: TaxType[] = ['Standard', 'Reduced', 'Exempt'];

const TAX_TYPE_LABEL: Record<TaxType, string> = {
  Standard: 'Standard',
  Reduced: 'Redusă',
  Exempt: 'Scutită',
};

const TAX_TYPE_VARIANT: Record<TaxType, BadgeProps['variant']> = {
  Standard: 'info',
  Reduced: 'warning',
  Exempt: 'secondary',
};

function toErrorMessage(err: unknown): string {
  return err instanceof ApiError
    ? err.status === 403
      ? 'Nu ai acces la modulul Facturare (entitlement/rol lipsă).'
      : err.message
    : 'Eroare la încărcarea produselor.';
}

export function ProductsPage() {
  const {
    items: products,
    error,
    search,
    setSearch,
    page,
    setPage,
    pageSize,
    setPageSize,
    pageItems,
    reload,
  } = useListPage<Product>((q) => ProductsApi.list(q), toErrorMessage);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState<Product | null>(null);

  return (
    <div className="container-fluid">
      <Breadcrumb className="mb-3">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink>Nomenclatoare</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Produse</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <Toolbar>
        <ToolbarHeading>
          <ToolbarPageTitle>Produse</ToolbarPageTitle>
          <ToolbarDescription>
            {products ? `${products.length} produse găsite` : 'Se încarcă…'}
          </ToolbarDescription>
        </ToolbarHeading>
        <ToolbarActions>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Caută după descriere sau cod…"
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
            + Adaugă produs
          </Button>
        </ToolbarActions>
      </Toolbar>

      {error && (
        <p className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {!error && products !== null && products.length === 0 && (
        <Card>
          <div className="p-10 text-center text-sm text-muted-foreground">
            Niciun produs încă — apasă „+ Adaugă produs" ca să creezi unul.
          </div>
        </Card>
      )}

      {!error && products !== null && products.length > 0 && (
        <Card>
          <CardTable>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cod</TableHead>
                  <TableHead>Descriere</TableHead>
                  <TableHead>U.M.</TableHead>
                  <TableHead>TVA</TableHead>
                  <TableHead className="text-right">Preț unitar</TableHead>
                  <TableHead>Cont</TableHead>
                  <TableHead className="text-right">Acțiuni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageItems.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono">{p.productCode}</TableCell>
                    <TableCell className="font-medium">{p.description}</TableCell>
                    <TableCell className="text-muted-foreground">{p.unitOfMeasure}</TableCell>
                    <TableCell>
                      <Badge variant={TAX_TYPE_VARIANT[p.defaultTaxType]} appearance="light">
                        {TAX_TYPE_LABEL[p.defaultTaxType]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{p.unitPrice ?? '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{p.revenueAccount}</TableCell>
                    <TableCell className="text-right">
                      <RowActions
                        onEdit={() => {
                          setEditing(p);
                          setFormOpen(true);
                        }}
                        onDelete={() => setDeleting(p)}
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
            total={products.length}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </Card>
      )}

      <ProductFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        product={editing}
        onSaved={() => void reload()}
      />

      {deleting && (
        <DeleteConfirmDialog
          open={!!deleting}
          onOpenChange={(open) => !open && setDeleting(null)}
          title={`Ștergi produsul „${deleting.description}"?`}
          description="Acțiunea nu poate fi anulată. Un produs folosit deja pe o factură nu poate fi șters."
          onConfirm={async () => {
            await ProductsApi.remove(deleting.id);
            await reload();
          }}
        />
      )}
    </div>
  );
}

function ProductFormDialog({
  open,
  onOpenChange,
  product,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: Product | null;
  onSaved: () => void;
}) {
  const isEdit = !!product;
  const [description, setDescription] = useState('');
  const [unitOfMeasure, setUnitOfMeasure] = useState('buc');
  const [defaultTaxType, setDefaultTaxType] = useState<TaxType>('Standard');
  const [unitPrice, setUnitPrice] = useState('');
  const [revenueAccount, setRevenueAccount] = useState('707');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setDescription(product?.description ?? '');
      setUnitOfMeasure(product?.unitOfMeasure ?? 'buc');
      setDefaultTaxType(product?.defaultTaxType ?? 'Standard');
      setUnitPrice(product?.unitPrice ?? '');
      setRevenueAccount(product?.revenueAccount ?? '707');
      setError(null);
    }
  }, [open, product]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      if (isEdit && product) {
        // unitPrice trimis ca `null` explicit când e golit (nu `undefined`,
        // care ar însemna „neschimbat" pentru Prisma updateMany — altfel
        // golirea prețului din formular era un no-op silențios, fără nicio
        // eroare afișată; fix logic-reviewer).
        await ProductsApi.update(product.id, {
          description,
          unitOfMeasure,
          defaultTaxType,
          unitPrice: unitPrice ? Number(unitPrice) : null,
          revenueAccount,
        });
      } else {
        await ProductsApi.create({
          description,
          unitOfMeasure,
          defaultTaxType,
          unitPrice: unitPrice ? Number(unitPrice) : undefined,
          revenueAccount,
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
          <DialogTitle>{isEdit ? 'Editează produs' : 'Produs nou'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <DialogBody className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="description">Descriere</Label>
              <Input
                id="description"
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="unitOfMeasure">U.M.</Label>
              <Input
                id="unitOfMeasure"
                required
                value={unitOfMeasure}
                onChange={(e) => setUnitOfMeasure(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Cotă TVA</Label>
                <Select value={defaultTaxType} onValueChange={(v) => setDefaultTaxType(v as TaxType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TAX_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {TAX_TYPE_LABEL[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="unitPrice">Preț unitar</Label>
                <Input
                  id="unitPrice"
                  type="number"
                  step="0.01"
                  min="0"
                  value={unitPrice}
                  onChange={(e) => setUnitPrice(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="revenueAccount">Cont contabil (venituri)</Label>
              <Input
                id="revenueAccount"
                required
                placeholder="ex: 707"
                value={revenueAccount}
                onChange={(e) => setRevenueAccount(e.target.value)}
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
