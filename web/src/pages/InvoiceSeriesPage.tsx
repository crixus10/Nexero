import { FormEvent, useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { InvoiceSeriesApi } from '../api';
import { ApiError } from '../api/client';
import type { DocumentType, InvoiceSeries } from '../api/types';
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

const DOCUMENT_TYPES: DocumentType[] = [
  'invoice',
  'proforma',
  'credit_note',
  'debit_note',
  'down_payment',
];

const DOCUMENT_TYPE_LABEL: Record<DocumentType, string> = {
  invoice: 'Factură',
  proforma: 'Proformă',
  credit_note: 'Notă de credit',
  debit_note: 'Notă de debit',
  down_payment: 'Avans',
};

function toErrorMessage(err: unknown): string {
  return err instanceof ApiError
    ? err.status === 403
      ? 'Nu ai acces la modulul Facturare (entitlement/rol lipsă).'
      : err.message
    : 'Eroare la încărcarea seriilor.';
}

export function InvoiceSeriesPage() {
  const {
    items: series,
    error,
    search,
    setSearch,
    page,
    setPage,
    pageSize,
    setPageSize,
    pageItems,
    reload,
  } = useListPage<InvoiceSeries>((q) => InvoiceSeriesApi.list(q), toErrorMessage);

  const [formOpen, setFormOpen] = useState(false);
  const [deleting, setDeleting] = useState<InvoiceSeries | null>(null);

  return (
    <div className="container-fluid">
      <Breadcrumb className="mb-3">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink>Nomenclatoare</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Serii facturare</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <Toolbar>
        <ToolbarHeading>
          <ToolbarPageTitle>Serii facturare</ToolbarPageTitle>
          <ToolbarDescription>
            {series ? `${series.length} serii găsite` : 'Se încarcă…'}
          </ToolbarDescription>
        </ToolbarHeading>
        <ToolbarActions>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Caută după cod…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-64 pl-8"
            />
          </div>
          <Button variant="primary" onClick={() => setFormOpen(true)}>
            + Adaugă serie
          </Button>
        </ToolbarActions>
      </Toolbar>

      {error && (
        <p className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {!error && series !== null && series.length === 0 && (
        <Card>
          <div className="p-10 text-center text-sm text-muted-foreground">
            Nicio serie încă — apasă „+ Adaugă serie" ca să creezi una.
          </div>
        </Card>
      )}

      {!error && series !== null && series.length > 0 && (
        <Card>
          <CardTable>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cod</TableHead>
                  <TableHead>Tip document</TableHead>
                  <TableHead className="text-right">Următorul nr.</TableHead>
                  <TableHead className="text-right">Acțiuni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageItems.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono">{s.seriesCode}</TableCell>
                    <TableCell>
                      <Badge variant="info" appearance="light">
                        {DOCUMENT_TYPE_LABEL[s.documentType]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">{s.nextNumber}</TableCell>
                    <TableCell className="text-right">
                      {/* Fără editare — vezi InvoiceSeriesService (backend):
                          o serie greșit configurată se șterge și se recreează,
                          niciodată editată (ar rupe garanția „fără goluri"). */}
                      <RowActions onDelete={() => setDeleting(s)} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardTable>
          <ListPagination
            page={page}
            pageSize={pageSize}
            total={series.length}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </Card>
      )}

      <SeriesFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        onSaved={() => void reload()}
      />

      {deleting && (
        <DeleteConfirmDialog
          open={!!deleting}
          onOpenChange={(open) => !open && setDeleting(null)}
          title={`Ștergi seria „${deleting.seriesCode}"?`}
          description="Acțiunea nu poate fi anulată. O serie cu cel puțin o factură emisă nu poate fi ștearsă."
          onConfirm={async () => {
            await InvoiceSeriesApi.remove(deleting.id);
            await reload();
          }}
        />
      )}
    </div>
  );
}

function SeriesFormDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [seriesCode, setSeriesCode] = useState('');
  const [documentType, setDocumentType] = useState<DocumentType>('invoice');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setSeriesCode('');
      setDocumentType('invoice');
      setError(null);
    }
  }, [open]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await InvoiceSeriesApi.create({ seriesCode, documentType });
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
          <DialogTitle>Serie nouă</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <DialogBody className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="seriesCode">Cod serie</Label>
              <Input
                id="seriesCode"
                required
                placeholder="ex: FACT, PROF, STORNO"
                value={seriesCode}
                onChange={(e) => setSeriesCode(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Tip document</Label>
              <Select value={documentType} onValueChange={(v) => setDocumentType(v as DocumentType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOCUMENT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {DOCUMENT_TYPE_LABEL[t]}
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
