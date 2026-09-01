import { useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CompaniesApi, ContactsApi, DealsApi, TasksApi } from '../../api';
import { ApiError } from '../../api/client';
import type { Company, Deal, Task } from '../../api/types';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Toolbar, ToolbarHeading, ToolbarPageTitle } from '@/components/toolbar';
import type { DealStatus } from '../../api/types';

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

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className="mt-1 text-2xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}

export function CrmDashboardPage() {
  const [companies, setCompanies] = useState<Company[] | null>(null);
  const [contactsCount, setContactsCount] = useState<number | null>(null);
  const [deals, setDeals] = useState<Deal[] | null>(null);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([CompaniesApi.list(), ContactsApi.list(), DealsApi.list(), TasksApi.list()])
      .then(([co, ct, d, t]) => {
        setCompanies(co);
        setContactsCount(ct.length);
        setDeals(d);
        setTasks(t);
      })
      .catch((err) => {
        setError(
          err instanceof ApiError && err.status === 403
            ? 'Nu ai acces la modulul Clienți (entitlement/rol lipsă).'
            : 'Eroare la încărcarea dashboard-ului.',
        );
      });
  }, []);

  const activeDeals = useMemo(
    () => (deals ?? []).filter((d) => d.status === 'proposal' || d.status === 'negotiation'),
    [deals],
  );
  const pipelineValue = useMemo(
    () => activeDeals.reduce((sum, d) => sum + Number(d.totalValue), 0),
    [activeDeals],
  );

  // Serie reală (nu date fabricate ca-n demo): valoarea pipeline-ului
  // grupată pe lună, din deal-urile existente — nu avem încă istoric
  // zilnic/orar, deci un grafic lunar e echivalentul real posibil acum.
  const monthlySeries = useMemo(() => {
    const byMonth = new Map<string, number>();
    for (const d of deals ?? []) {
      const month = d.dealDate.slice(0, 7);
      byMonth.set(month, (byMonth.get(month) ?? 0) + Number(d.totalValue));
    }
    return Array.from(byMonth.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, value]) => ({ month, value }));
  }, [deals]);

  const tasksDone = (tasks ?? []).filter((t) => t.status === 'done').length;
  const tasksInProgress = (tasks ?? []).filter((t) => t.status === 'in_progress').length;
  const tasksPending = (tasks ?? []).filter((t) => t.status === 'pending').length;

  const recentDeals = [...(deals ?? [])]
    .sort((a, b) => (a.dealDate < b.dealDate ? 1 : -1))
    .slice(0, 5);

  return (
    <div className="container-fluid">
      <Toolbar>
        <ToolbarHeading>
          <ToolbarPageTitle>Dashboard</ToolbarPageTitle>
        </ToolbarHeading>
      </Toolbar>

      {error && (
        <p className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {!error && (
        <>
          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Total Contacts" value={contactsCount === null ? '…' : String(contactsCount)} />
            <StatCard label="Active Deals" value={deals === null ? '…' : String(activeDeals.length)} />
            <StatCard
              label="Pipeline Value"
              value={deals === null ? '…' : `${pipelineValue.toLocaleString('ro-RO')} RON`}
            />
            <StatCard label="Companies" value={companies === null ? '…' : String(companies.length)} />
          </div>

          <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Pipeline Value (lunar)</CardTitle>
              </CardHeader>
              <CardContent className="p-5">
                {monthlySeries.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Niciun deal încă.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={monthlySeries}>
                      <defs>
                        <linearGradient id="pipelineGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} width={40} />
                      <Tooltip
                        formatter={(v) => `${Number(v).toLocaleString('ro-RO')} RON`}
                      />
                      <Area
                        type="monotone"
                        dataKey="value"
                        stroke="var(--color-primary)"
                        fill="url(#pipelineGradient)"
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Tasks Overview</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-3 gap-3 p-5">
                <div className="rounded-md bg-muted/50 p-4 text-center">
                  <div className="text-2xl font-semibold text-emerald-600">{tasksDone}</div>
                  <div className="text-xs text-muted-foreground">Done</div>
                </div>
                <div className="rounded-md bg-muted/50 p-4 text-center">
                  <div className="text-2xl font-semibold text-blue-600">{tasksInProgress}</div>
                  <div className="text-xs text-muted-foreground">In Progress</div>
                </div>
                <div className="rounded-md bg-muted/50 p-4 text-center">
                  <div className="text-2xl font-semibold text-muted-foreground">{tasksPending}</div>
                  <div className="text-xs text-muted-foreground">Pending</div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Deals Overview</CardTitle>
            </CardHeader>
            {recentDeals.length === 0 ? (
              <div className="p-10 text-center text-sm text-muted-foreground">Niciun deal încă.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Deal #</TableHead>
                    <TableHead>Titlu</TableHead>
                    <TableHead className="text-right">Valoare</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Dată</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentDeals.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="font-mono">{d.dealCode}</TableCell>
                      <TableCell>{d.title}</TableCell>
                      <TableCell className="text-right">
                        {d.totalValue} {d.currency}
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[d.status]} appearance="light">
                          {STATUS_LABEL[d.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{d.dealDate.slice(0, 10)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
