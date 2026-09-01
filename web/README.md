# Nexero — web (frontend)

React SPA per `CLAUDE.md` (stack fixat) — consumă exclusiv API-ul din `/`
(NestJS). Regula #1 din `CLAUDE.md` rămâne validă aici: nicio logică de
business în frontend, doar apeluri către API și afișare.

## Stare: Metronic 9 integrat (Layout 11) + Facturare + CRM ("Clienți")

`CLAUDE.md` fixează UI kit-ul ca **Metronic 9** (React, Tailwind v4/KTUI,
licență Regular cumpărată deja — **doar pentru dezvoltare**; upgrade la
Extended rămâne condiție de go-live, vezi `CLAUDE.md`). Layout-ul ales e
**Layout 11** (header cu tab-uri de modul + sidebar grupat pe pagini),
adaptat sub `src/components/layout/`; componentele UI (shadcn/Radix-style,
livrate ca parte a pachetului Metronic React) stau în `src/components/ui/`.
Sursa vendor originală (ThemeForest, doar pentru referință/dezvoltare, NU
în git — vezi `.gitignore`) e la rădăcina repo-ului, folder soră cu `web/`.

Doi tab-uri de sus, fiecare cu sidebar propriu (filtrat prin `rootPath`,
vezi `src/config/nav.config.tsx` + `src/components/layout/components/
sidebar-menu.tsx` — Layout 11 vendor nu are acest mecanism, are un singur
sidebar static):

- **Facturare** — listă facturi, factură nouă (client/serie/linii → draft
  → emitere), Nomenclatoare (Produse, Serii de facturare — Serii nu au
  editare, deliberat: ar rupe garanția „fără goluri" a numerotării, vezi
  `InvoiceSeriesService` backend).
- **Clienți** (modulul CRM, `docs/crm-spec.md`) — Dashboard (stat carduri
  + grafic pipeline lunar + Tasks Overview, date reale, nu fabricate),
  Contacte (tab-uri Leads/Follow-ups/Pipeline), Companii (înlocuiește
  fostul nomenclator simplu „Clienți" din Facturare — `Customer`→
  `Company`, cod fiscal vizibil, cod auto-generat), profil individual de
  companie (`/crm/companies/:id`, tab-uri Overview/Note/Sarcini/Echipă),
  Deal-uri (tab-uri Active/Closed/Upcoming, layout card, legate opțional
  de o factură reală din Facturare), Sarcini, Note.

Coduri auto-generate peste tot în nomenclatoare (Clienți/Produse/Contacte/
Deal-uri) — niciun formular nu mai are câmp de cod tastat manual.

## Rulare locală

```bash
cd web
npm install
cp .env.example .env.local   # doar dacă API-ul nu rulează pe :3000
npm run dev
```

Deschide `http://localhost:5173`. API-ul (`npm run start:dev` din
rădăcina repo) trebuie să ruleze pe `:3000` (sau orice pui în
`VITE_API_URL`) — și trebuie pornit cu CORS activat pentru
`http://localhost:5173` (implicit, vezi `src/main.ts`, `FRONTEND_URL`).

**Cont de test** (din `prisma/seed.ts`, rulează `npx prisma db seed` o
dată dacă n-ai făcut-o): `test@nexero.local` / `parola-test-123` — are deja
entitlement activ pe modulele `invoicing` (rol `invoicing:admin`) și `crm`
(rol `crm:admin`), DOAR pentru testare locală (vezi comentariul din
`seed.ts` — activarea reală de producție rămâne exclusiv din webhook-ul
de plată, regula #4 din `CLAUDE.md`). Seed-ul include și date demo CRM
(o companie, un contact, un deal, o sarcină, o notă).

## Structură

```
src/
  api/         apeluri tipate către API (client.ts = fetch + JWT + erori)
  auth/        AuthContext (token în localStorage) + RequireAuth (route guard)
  config/      nav.config.tsx (meniu header + sidebar, per modul), types.ts
  components/
    layout/    Layout 11 adaptat (header cu tab-uri, sidebar filtrat pe rootPath)
    ui/        primitive shadcn/Radix (Metronic React), reutilizate de toate paginile
    *.tsx      componente comune între pagini (list-pagination, row-actions,
               delete-confirm-dialog, user-multi-select, use-list-page hook)
  pages/
    LoginPage, InvoicesPage, NewInvoicePage, ProductsPage, InvoiceSeriesPage
    crm/       CompaniesPage, CompanyDetailPage, ContactsPage, DealsPage,
               TasksPage, NotesPage, CrmDashboardPage
```
