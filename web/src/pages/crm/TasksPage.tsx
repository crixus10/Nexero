import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CompaniesApi, ContactsApi, DealsApi, TasksApi } from '../../api';
import { ApiError } from '../../api/client';
import type { Company, Contact, Deal, Priority, Task, TaskStatus } from '../../api/types';
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { DeleteConfirmDialog } from '@/components/delete-confirm-dialog';
import { RowActions } from '@/components/row-actions';
import { UserMultiSelect } from '@/components/user-multi-select';
import {
  Toolbar,
  ToolbarActions,
  ToolbarDescription,
  ToolbarHeading,
  ToolbarPageTitle,
} from '@/components/toolbar';

type TaskTab = 'today' | 'week' | 'completed';

const PRIORITY_LABEL: Record<Priority, string> = { low: 'Low', medium: 'Medium', high: 'High' };
const PRIORITY_VARIANT: Record<Priority, BadgeProps['variant']> = {
  low: 'secondary',
  medium: 'warning',
  high: 'destructive',
};
const STATUS_LABEL: Record<TaskStatus, string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  done: 'Done',
};
const STATUS_VARIANT: Record<TaskStatus, BadgeProps['variant']> = {
  pending: 'secondary',
  in_progress: 'info',
  done: 'success',
};

function toErrorMessage(err: unknown): string {
  return err instanceof ApiError
    ? err.status === 403
      ? 'Nu ai acces la modulul Clienți (entitlement/rol lipsă).'
      : err.message
    : 'Eroare la încărcarea sarcinilor.';
}

function inNextDays(dueAt: string | null, days: number): boolean {
  if (!dueAt) return false;
  const due = new Date(dueAt).getTime();
  const now = Date.now();
  return due >= now - 86400000 && due <= now + days * 86400000;
}

export function TasksPage() {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TaskTab>('today');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [deleting, setDeleting] = useState<Task | null>(null);

  async function reload() {
    try {
      const [t, c, ct, d] = await Promise.all([
        TasksApi.list(),
        CompaniesApi.list(),
        ContactsApi.list(),
        DealsApi.list(),
      ]);
      setTasks(t);
      setCompanies(c);
      setContacts(ct);
      setDeals(d);
      setError(null);
    } catch (err) {
      setError(toErrorMessage(err));
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  const filtered = (tasks ?? []).filter((t) => {
    if (tab === 'completed') return t.status === 'done';
    if (tab === 'today') return t.status !== 'done' && inNextDays(t.dueAt, 1);
    return t.status !== 'done' && inNextDays(t.dueAt, 7);
  });

  const companyById = new Map(companies.map((c) => [c.id, c]));
  const dealById = new Map(deals.map((d) => [d.id, d]));

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
            <BreadcrumbPage>Sarcini</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <Toolbar>
        <ToolbarHeading>
          <ToolbarPageTitle>Sarcini</ToolbarPageTitle>
          <ToolbarDescription>
            {tasks ? `${tasks.length} sarcini găsite` : 'Se încarcă…'}
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
            + Adaugă sarcină
          </Button>
        </ToolbarActions>
      </Toolbar>

      <Tabs value={tab} onValueChange={(v) => setTab(v as TaskTab)} className="mb-4">
        <TabsList variant="line">
          <TabsTrigger value="today">Astăzi</TabsTrigger>
          <TabsTrigger value="week">Săptămâna asta</TabsTrigger>
          <TabsTrigger value="completed">Finalizate</TabsTrigger>
        </TabsList>
      </Tabs>

      {error && (
        <p className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {!error && tasks !== null && filtered.length === 0 && (
        <Card>
          <div className="p-10 text-center text-sm text-muted-foreground">
            Nicio sarcină aici încă.
          </div>
        </Card>
      )}

      {!error && filtered.length > 0 && (
        <Card>
          <CardTable>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sarcină</TableHead>
                  <TableHead>Asignat</TableHead>
                  <TableHead>Prioritate</TableHead>
                  <TableHead>Termen</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Legătură</TableHead>
                  <TableHead className="text-right">Acțiuni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.title}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {t.assignees.length === 0
                        ? '—'
                        : t.assignees.map((a) => a.user.fullName || a.user.email).join(', ')}
                    </TableCell>
                    <TableCell>
                      <Badge variant={PRIORITY_VARIANT[t.priority]} appearance="light">
                        {PRIORITY_LABEL[t.priority]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {t.dueAt ? new Date(t.dueAt).toLocaleString('ro-RO') : '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[t.status]} appearance="light">
                        {STATUS_LABEL[t.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {t.companyId && (companyById.get(t.companyId)?.name ?? '—')}
                      {t.dealId && (dealById.get(t.dealId)?.title ?? '—')}
                      {!t.companyId && !t.dealId && '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <RowActions
                        onEdit={() => {
                          setEditing(t);
                          setFormOpen(true);
                        }}
                        onDelete={() => setDeleting(t)}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardTable>
        </Card>
      )}

      <TaskFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        task={editing}
        companies={companies}
        contacts={contacts}
        deals={deals}
        onSaved={() => void reload()}
      />

      {deleting && (
        <DeleteConfirmDialog
          open={!!deleting}
          onOpenChange={(open) => !open && setDeleting(null)}
          title={`Ștergi sarcina „${deleting.title}"?`}
          description="Acțiunea nu poate fi anulată."
          onConfirm={async () => {
            await TasksApi.remove(deleting.id);
            await reload();
          }}
        />
      )}
    </div>
  );
}

function TaskFormDialog({
  open,
  onOpenChange,
  task,
  companies,
  contacts,
  deals,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: Task | null;
  companies: Company[];
  contacts: Contact[];
  deals: Deal[];
  onSaved: () => void;
}) {
  const isEdit = !!task;
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [status, setStatus] = useState<TaskStatus>('pending');
  const [companyId, setCompanyId] = useState('');
  const [contactId, setContactId] = useState('');
  const [dealId, setDealId] = useState('');
  const [assigneeUserIds, setAssigneeUserIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(task?.title ?? '');
      setDescription(task?.description ?? '');
      setDueAt(task?.dueAt ? task.dueAt.slice(0, 16) : '');
      setPriority(task?.priority ?? 'medium');
      setStatus(task?.status ?? 'pending');
      setCompanyId(task?.companyId ?? '');
      setContactId(task?.contactId ?? '');
      setDealId(task?.dealId ?? '');
      setAssigneeUserIds(task?.assignees.map((a) => a.userId) ?? []);
      setError(null);
    }
  }, [open, task]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      // `null` explicit golește câmpul la editare (`undefined` ar însemna
      // „neschimbat" — vezi fix logic-reviewer, CompaniesPage.tsx).
      const payload = {
        title,
        description: description || null,
        dueAt: dueAt ? new Date(dueAt).toISOString() : null,
        priority,
        status,
        companyId: companyId || null,
        contactId: contactId || null,
        dealId: dealId || null,
        assigneeUserIds,
      };
      if (isEdit && task) {
        await TasksApi.update(task.id, payload);
      } else {
        await TasksApi.create(payload);
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
          <DialogTitle>{isEdit ? 'Editează sarcină' : 'Sarcină nouă'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <DialogBody className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="title">Titlu</Label>
              <Input id="title" required value={title} onChange={(e) => setTitle(e.target.value)} />
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
                <Label htmlFor="dueAt">Termen</Label>
                <Input
                  id="dueAt"
                  type="datetime-local"
                  value={dueAt}
                  onChange={(e) => setDueAt(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Prioritate</Label>
                <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as TaskStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="done">Done</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Companie</Label>
                <Select value={companyId || '__none__'} onValueChange={(v) => setCompanyId(v === '__none__' ? '' : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">—</SelectItem>
                    {companies.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Contact</Label>
                <Select value={contactId || '__none__'} onValueChange={(v) => setContactId(v === '__none__' ? '' : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">—</SelectItem>
                    {contacts.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Deal</Label>
                <Select value={dealId || '__none__'} onValueChange={(v) => setDealId(v === '__none__' ? '' : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">—</SelectItem>
                    {deals.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <UserMultiSelect label="Asignat" selectedIds={assigneeUserIds} onChange={setAssigneeUserIds} />
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
