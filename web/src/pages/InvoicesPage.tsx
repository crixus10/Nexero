import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { InvoicesApi } from '../api';
import { ApiError } from '../api/client';
import type { Invoice, InvoiceStatus } from '../api/types';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardTable } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Toolbar, ToolbarActions, ToolbarHeading, ToolbarPageTitle } from '@/components/toolbar';

const STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: 'Draft',
  issued: 'Emisă',
  sent: 'Trimisă',
  paid: 'Plătită',
  partially_paid: 'Parțial plătită',
  overdue: 'Restantă',
  canceled: 'Anulată',
};

const STATUS_VARIANT: Record<InvoiceStatus, BadgeProps['variant']> = {
  draft: 'secondary',
  issued: 'info',
  sent: 'info',
  paid: 'success',
  partially_paid: 'warning',
  overdue: 'destructive',
  canceled: 'outline',
};

export function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    InvoicesApi.list()
      .then(setInvoices)
      .catch((err) => {
        setError(
          err instanceof ApiError
            ? err.status === 403
              ? 'Nu ai acces la modulul Facturare (entitlement/rol lipsă) — vezi nota din prisma/seed.ts.'
              : err.message
            : 'Eroare la încărcarea facturilor.',
        );
      });
  }, []);

  return (
    <div className="container-fluid">
      <Toolbar>
        <ToolbarHeading>
          <ToolbarPageTitle>Facturi</ToolbarPageTitle>
        </ToolbarHeading>
        <ToolbarActions>
          <Button variant="primary" asChild>
            <Link to="/invoices/new">+ Factură nouă</Link>
          </Button>
        </ToolbarActions>
      </Toolbar>

      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}

      {!error && invoices === null && (
        <p className="text-sm text-muted-foreground">Se încarcă…</p>
      )}

      {!error && invoices !== null && invoices.length === 0 && (
        <Card>
          <div className="p-10 text-center text-sm text-muted-foreground">
            Nicio factură încă — apasă „Factură nouă" ca să creezi una de test.
          </div>
        </Card>
      )}

      {!error && invoices !== null && invoices.length > 0 && (
        <Card>
          <CardTable>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nr. factură</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>e-Factura</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-mono">{inv.invoiceNo}</TableCell>
                    <TableCell>{inv.invoiceDate.slice(0, 10)}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[inv.status]} appearance="light">
                        {STATUS_LABEL[inv.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {inv.eInvoiceStatus ?? '—'}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {inv.invoiceAmount} {inv.currency}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardTable>
        </Card>
      )}
    </div>
  );
}
