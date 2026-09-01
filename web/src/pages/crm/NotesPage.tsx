import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Star } from 'lucide-react';
import { CompaniesApi, ContactsApi, DealsApi, NotesApi } from '../../api';
import { ApiError } from '../../api/client';
import type { Company, Contact, Deal, Note, Priority, TaskStatus } from '../../api/types';
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
import { Card, CardContent, CardTable } from '@/components/ui/card';
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

type NoteTab = 'today' | 'week' | 'archive';

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
    : 'Eroare la încărcarea notelor.';
}

function daysAgo(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 86400000;
}

export function NotesPage() {
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<NoteTab>('today');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Note | null>(null);
  const [deleting, setDeleting] = useState<Note | null>(null);

  async function reload() {
    try {
      const [n, c, ct, d] = await Promise.all([
        NotesApi.list(),
        CompaniesApi.list(),
        ContactsApi.list(),
        DealsApi.list(),
      ]);
      setNotes(n);
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

  const favorites = (notes ?? []).filter((n) => n.isFavorite).slice(0, 3);
  const filtered = (notes ?? []).filter((n) => {
    if (tab === 'archive') return daysAgo(n.createdAt) > 7;
    if (tab === 'today') return daysAgo(n.createdAt) <= 1;
    return daysAgo(n.createdAt) <= 7;
  });

  async function toggleFavorite(note: Note) {
    await NotesApi.update(note.id, { isFavorite: !note.isFavorite });
    await reload();
  }

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
            <BreadcrumbPage>Note</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <Toolbar>
        <ToolbarHeading>
          <ToolbarPageTitle>Note</ToolbarPageTitle>
          <ToolbarDescription>
            {notes ? `${notes.length} note găsite` : 'Se încarcă…'}
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
            + Adaugă notă
          </Button>
        </ToolbarActions>
      </Toolbar>

      {favorites.length > 0 && (
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {favorites.map((n) => (
            <Card key={n.id}>
              <CardContent className="p-4">
                <div className="mb-1 text-sm font-medium">{n.title}</div>
                <p className="line-clamp-2 text-xs text-muted-foreground">
                  {n.content || 'Fără conținut.'}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as NoteTab)} className="mb-4">
        <TabsList variant="line">
          <TabsTrigger value="today">Astăzi</TabsTrigger>
          <TabsTrigger value="week">Săptămâna asta</TabsTrigger>
          <TabsTrigger value="archive">Arhivă</TabsTrigger>
        </TabsList>
      </Tabs>

      {error && (
        <p className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {!error && notes !== null && filtered.length === 0 && (
        <Card>
          <div className="p-10 text-center text-sm text-muted-foreground">Nicio notă aici încă.</div>
        </Card>
      )}

      {!error && filtered.length > 0 && (
        <Card>
          <CardTable>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Notă</TableHead>
                  <TableHead>Asignat</TableHead>
                  <TableHead>Prioritate</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Adăugată</TableHead>
                  <TableHead className="text-right">Acțiuni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((n) => (
                  <TableRow key={n.id}>
                    <TableCell className="font-medium">{n.title}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {n.assignees.length === 0
                        ? '—'
                        : n.assignees.map((a) => a.user.fullName || a.user.email).join(', ')}
                    </TableCell>
                    <TableCell>
                      <Badge variant={PRIORITY_VARIANT[n.priority]} appearance="light">
                        {PRIORITY_LABEL[n.priority]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[n.status]} appearance="light">
                        {STATUS_LABEL[n.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(n.createdAt).toLocaleDateString('ro-RO')}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" mode="icon" size="sm" onClick={() => void toggleFavorite(n)}>
                          <Star className={n.isFavorite ? 'fill-yellow-400 text-yellow-400' : ''} />
                        </Button>
                        <RowActions
                          onEdit={() => {
                            setEditing(n);
                            setFormOpen(true);
                          }}
                          onDelete={() => setDeleting(n)}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardTable>
        </Card>
      )}

      <NoteFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        note={editing}
        companies={companies}
        contacts={contacts}
        deals={deals}
        onSaved={() => void reload()}
      />

      {deleting && (
        <DeleteConfirmDialog
          open={!!deleting}
          onOpenChange={(open) => !open && setDeleting(null)}
          title={`Ștergi nota „${deleting.title}"?`}
          description="Acțiunea nu poate fi anulată."
          onConfirm={async () => {
            await NotesApi.remove(deleting.id);
            await reload();
          }}
        />
      )}
    </div>
  );
}

function NoteFormDialog({
  open,
  onOpenChange,
  note,
  companies,
  contacts,
  deals,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  note: Note | null;
  companies: Company[];
  contacts: Contact[];
  deals: Deal[];
  onSaved: () => void;
}) {
  const isEdit = !!note;
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('');
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
      setTitle(note?.title ?? '');
      setContent(note?.content ?? '');
      setCategory(note?.category ?? '');
      setPriority(note?.priority ?? 'medium');
      setStatus(note?.status ?? 'pending');
      setCompanyId(note?.companyId ?? '');
      setContactId(note?.contactId ?? '');
      setDealId(note?.dealId ?? '');
      setAssigneeUserIds(note?.assignees.map((a) => a.userId) ?? []);
      setError(null);
    }
  }, [open, note]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      // `null` explicit golește câmpul la editare — vezi fix
      // logic-reviewer, CompaniesPage.tsx.
      const payload = {
        title,
        content: content || null,
        category: category || null,
        priority,
        status,
        companyId: companyId || null,
        contactId: contactId || null,
        dealId: dealId || null,
        assigneeUserIds,
      };
      if (isEdit && note) {
        await NotesApi.update(note.id, payload);
      } else {
        await NotesApi.create(payload);
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
          <DialogTitle>{isEdit ? 'Editează notă' : 'Notă nouă'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <DialogBody className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="title">Titlu</Label>
              <Input id="title" required value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="content">Conținut</Label>
              <Textarea
                id="content"
                variant="sm"
                rows={3}
                value={content}
                onChange={(e) => setContent(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="category">Categorie</Label>
                <Input id="category" value={category} onChange={(e) => setCategory(e.target.value)} />
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
