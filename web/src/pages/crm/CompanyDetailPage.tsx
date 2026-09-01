import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CompaniesApi, ContactsApi, NotesApi, TasksApi } from '../../api';
import { ApiError } from '../../api/client';
import type { Company, Contact, Note, Task } from '../../api/types';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Toolbar, ToolbarHeading, ToolbarPageTitle } from '@/components/toolbar';

/**
 * Profil individual de companie — tab-uri Overview/Notes/Tasks/Team (fără
 * Activity/Files/Comments din demo: ar cere un log de audit generic,
 * storage de fișiere și un model de comentarii încă nedefinite — se
 * adaugă separat, când există un motiv real, nu ca UI gol fără date
 * reale în spate; vezi planul aprobat pentru „Devieri asumate").
 */
export function CompanyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [company, setCompany] = useState<Company | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      CompaniesApi.get(id),
      ContactsApi.list(),
      NotesApi.list(),
      TasksApi.list(),
    ])
      .then(([c, ct, n, t]) => {
        setCompany(c);
        setContacts(ct.filter((x) => x.companyId === id));
        setNotes(n.filter((x) => x.companyId === id));
        setTasks(t.filter((x) => x.companyId === id));
      })
      .catch((err) => {
        setError(
          err instanceof ApiError
            ? err.status === 404
              ? 'Compania nu există.'
              : err.message
            : 'Eroare la încărcarea companiei.',
        );
      });
  }, [id]);

  if (error) {
    return (
      <div className="container-fluid">
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      </div>
    );
  }

  if (!company) {
    return (
      <div className="container-fluid">
        <p className="text-sm text-muted-foreground">Se încarcă…</p>
      </div>
    );
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
            <BreadcrumbLink asChild>
              <Link to="/crm/companies">Companii</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{company.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <Toolbar>
        <ToolbarHeading>
          <ToolbarPageTitle>{company.name}</ToolbarPageTitle>
        </ToolbarHeading>
      </Toolbar>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <Tabs defaultValue="overview">
          <TabsList variant="line" className="mb-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="notes">Note ({notes.length})</TabsTrigger>
            <TabsTrigger value="tasks">Sarcini ({tasks.length})</TabsTrigger>
            <TabsTrigger value="team">Echipă ({company.teamMembers.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <Card>
              <CardContent className="space-y-4 p-5">
                <div>
                  <div className="mb-2 text-sm font-medium">Descriere</div>
                  <p className="text-sm text-muted-foreground">
                    {company.description || 'Fără descriere.'}
                  </p>
                </div>
                <Separator />
                <div>
                  <div className="mb-2 text-sm font-medium">Contacte ({contacts.length})</div>
                  {contacts.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Niciun contact legat de această companie.</p>
                  ) : (
                    <ul className="space-y-1 text-sm">
                      {contacts.map((c) => (
                        <li key={c.id}>
                          {c.name} {c.position && <span className="text-muted-foreground">— {c.position}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="notes">
            <Card>
              <CardContent className="space-y-3 p-5">
                {notes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nicio notă legată de această companie.</p>
                ) : (
                  notes.map((n) => (
                    <div key={n.id} className="rounded-md border border-border p-3">
                      <div className="text-sm font-medium">{n.title}</div>
                      <p className="text-xs text-muted-foreground">{n.content}</p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tasks">
            <Card>
              <CardContent className="space-y-3 p-5">
                {tasks.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nicio sarcină legată de această companie.</p>
                ) : (
                  tasks.map((t) => (
                    <div key={t.id} className="flex items-center justify-between rounded-md border border-border p-3">
                      <span className="text-sm">{t.title}</span>
                      <Badge variant="secondary" appearance="light">
                        {t.status}
                      </Badge>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="team">
            <Card>
              <CardContent className="space-y-2 p-5">
                {company.teamMembers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nicio persoană asignată încă.</p>
                ) : (
                  company.teamMembers.map((m) => (
                    <div key={m.userId} className="text-sm">
                      {m.user.fullName || m.user.email}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Card>
          <CardHeader>
            <CardTitle>Detalii companie</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 p-5 text-sm">
            <DetailRow label="Cod" value={company.companyCode} />
            <DetailRow label="Cod fiscal" value={company.taxId ?? '—'} />
            <DetailRow label="Website" value={company.website ?? '—'} />
            <DetailRow label="Email" value={company.email ?? '—'} />
            <DetailRow label="Telefon" value={company.phone ?? '—'} />
            <DetailRow label="Adresă" value={company.address ?? '—'} />
            <DetailRow label="Localitate" value={company.city ?? '—'} />
            <DetailRow label="Venit estimat" value={company.estimatedRevenueRange ?? '—'} />
            {company.categories.length > 0 && (
              <div>
                <div className="mb-1 text-muted-foreground">Categorii</div>
                <div className="flex flex-wrap gap-1">
                  {company.categories.map((cat) => (
                    <Badge key={cat} variant="secondary" appearance="light" size="sm">
                      {cat}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
