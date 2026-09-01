# Nexero — web (frontend)

React SPA per `CLAUDE.md` (stack fixat) — consumă exclusiv API-ul din `/`
(NestJS). Regula #1 din `CLAUDE.md` rămâne validă aici: nicio logică de
business în frontend, doar apeluri către API și afișare.

## Stare: Metronic 9 integrat (Layout 11) + Facturare + Nomenclatoare

`CLAUDE.md` fixează UI kit-ul ca **Metronic 9** (React, Tailwind v4/KTUI,
licență Regular cumpărată deja — **doar pentru dezvoltare**; upgrade la
Extended rămâne condiție de go-live, vezi `CLAUDE.md`). Layout-ul ales e
**Layout 11** (header cu tab-uri de modul + sidebar grupat pe pagini),
adaptat sub `src/components/layout/`; componentele UI (shadcn/Radix-style,
livrate ca parte a pachetului Metronic React) stau în `src/components/ui/`.
Sursa vendor originală (ThemeForest, doar pentru referință/dezvoltare, NU
în git — vezi `.gitignore`) e la rădăcina repo-ului, folder soră cu `web/`.

Ce există acum, complet funcțional contra API-ului real:
- Autentificare (`LoginPage`) + rutare protejată (`RequireAuth`).
- Facturare: listă facturi, factură nouă (client/serie/linii → draft →
  emitere), temă dark/light, meniu lateral pe module.
- **Nomenclatoare** (grup separat în sidebar): Clienți, Produse, Serii de
  facturare — listă cu căutare server-side (`?q=`), paginare client-side,
  formular de adăugare/editare (dialog), ștergere cu confirmare (traduce
  eroarea de FK 409 din backend într-un mesaj prietenos, nu generic).
  Seriile de facturare nu au editare — deliberat, vezi
  `InvoiceSeriesService` (backend): editarea ar rupe garanția „fără
  goluri" a numerotării.

Ce lipsește încă, speculativ: Stocuri/CRM (fazele următoare din
`docs/roadmap.md`) nu au pagini — nu adăuga tab-uri de sidebar pentru ele
înainte să existe rute reale în backend.

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
un entitlement activ pe modulul `invoicing` și rolul `invoicing:admin`,
DOAR pentru testare locală (vezi comentariul din `seed.ts` — activarea
reală de producție rămâne exclusiv din webhook-ul de plată, regula #4 din
`CLAUDE.md`).

## Structură

```
src/
  api/         apeluri tipate către API (client.ts = fetch + JWT + erori)
  auth/        AuthContext (token în localStorage) + RequireAuth (route guard)
  components/  Layout comun (navigare + logout)
  pages/       LoginPage, InvoicesPage (listă), NewInvoicePage (fluxul de test)
```
