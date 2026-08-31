---
name: platform-admin-spec
---

# Panel Admin Intern — specificație (doar Mittani Solutions)

Citit la nevoie, când se lucrează în `src/modules/platform-admin` sau în
`.claude/agents/platform-admin-guardian.md`. Nu face parte din niciun modul
vândut clienților — e tooling operațional intern, pentru echipa Mittani
Solutions.

## Scop

Un singur loc unde echipa Mittani vede, per client (tenant) și agregat pe
toată platforma: planul activ, ID-ul de sistem, încasările Stripe/Netopia,
modulele active + numărul de utilizatori, consumul AI, timpul petrecut în
aplicație, intervalul orar de utilizare, numărul total de clienți, data
înființării contului, și indicatori de business derivați (MRR/ARR, churn,
conversie trial→plătitor). Vezi lista completă mai jos.

## Regula critică — nu e un modul, e invizibil pentru clienți

Spre deosebire de orice altceva din acest kit, panelul admin **nu trece
prin `ModuleGuard`** și **nu apare niciodată** ca opțiune activabilă în
`modules`/`tenant_modules`. Nu există niciun tenant, niciun plan, nicio
condiție de business sub care un cont de client să poată vedea acest
panel — accesul se decide exclusiv de apartenența la tabela
`platform_admins`, complet separată de `tenants`/`users`.

Această regulă e cea mai puternică din tot kitul: o breșă aici nu expune
datele unui client altui client (ca la Portalul Clienți), ci expune datele
**tuturor** clienților către oricine — de asta panelul are propriul agent
de verificare, `platform-admin-guardian`, cu prioritate BLOCANT pe orice
cale de acces care nu trece explicit prin `PlatformAdminGuard`.

## Ce e deja implementat vs. ce se adaugă acum

`users` (staff-ul unui tenant, login prin JWT) **există deja**, implementat
real în `src/auth/` — nu e un gap de schemă, e cod funcțional (vezi
`docs/data-model.md`, secțiunea „Autentificare (JWT)"). Decizie deja fixată
prin implementare, nu de redeschis aici: `users.email` e `UNIQUE` **global**
(nu per-tenant) — un user aparține unei singure firme.

Coloanele `full_name`/`role`/`is_active` pe `users` (RBAC per-modul, conform
`docs/invoicing-spec.md`) sunt **deja implementate** (migrarea
`20260831171502_add_user_roles`, `src/users/`, `src/rbac/` — vezi
`docs/data-model.md`, secțiunea „RBAC — `users.role` (global) +
`user_module_roles` (per-modul)"). Ce lipsește încă și se adaugă separat,
printr-o migrare Prisma nouă (nu editarea migrărilor existente): cele două
tabele de mai jos (`platform_admins`, `payments`). DDL complet:
`docs/data-model.md`, secțiunea „Tabele suplimentare — admin platformă,
plăți".

## Schema

Două tabele noi + o extensie pe `users`, toate documentate cu DDL complet
în `docs/data-model.md` (nu duplicat aici, ca să nu existe două surse de
adevăr pentru schemă):

- **`users`** (extins, nu recreat) — capătă `full_name`/`role`/`is_active`
  pentru RBAC; `tenant_id` și `email` (UNIQUE global) rămân neschimbate.
- **`platform_admins`** — contul de staff Mittani Solutions; **fără**
  `tenant_id`, intenționat — nu aparține niciunui client, la fel cum
  `portal_users` nu aparține niciunui tenant, dar din motivul opus (aici,
  izolare de securitate; acolo, identitate globală de creștere).
- **`payments`** — jurnal de tranzacții Stripe/Netopia, separat de
  `tenant_modules` (care ține doar starea curentă de acces, nu istoricul
  de încasări). Scris exclusiv din același handler de webhook care
  actualizează `tenant_modules` (regula #4 din `CLAUDE.md` — activare doar
  din webhook — se extinde acum și la scrierea în `payments`).

## `PlatformAdminGuard` — distinct de `ModuleGuard`

Nu e o variantă a `ModuleGuard` cu un „modul" special — e un guard separat,
care nu verifică deloc `tenant_id`/entitlements, doar apartenența la
`platform_admins` și `is_active = true`. Aplicat exclusiv pe un namespace
de rute complet separat (ex. `/platform-admin/*`), niciodată amestecat cu
un controller care mai deservește și rute de tenant.

```typescript
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(private platformAdmins: PlatformAdminsService) {}

  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest();
    const admin = await this.platformAdmins.getActiveBySession(req);
    if (!admin) {
      throw new ForbiddenException('Acces restricționat.');
    }
    req.platformAdmin = admin;
    return true;
  }
}
```

## Frontend — deploy separat, nu doar rută separată în `web/`

Recomandare fermă: panelul admin nu e o secțiune ascunsă în aceeași
aplicație React livrată clienților, ci un build/deploy separat (poate
rămâne în același monorepo, folder propriu, ex. `web-admin/`), servit pe
un subdomeniu distinct (ex. `admin.mittani.ro`), cu autentificare proprie
(2FA obligatoriu pentru `platform_admins`, spre deosebire de login-ul de
tenant). Motivul: separarea fizică de deploy elimină o clasă întreagă de
riscuri (rută admin ajunsă accidental în bundle-ul public, link intern
partajat greșit, CSP mai relaxat pe aplicația publică) fără cost
suplimentar real — e tot React, tot pe același API NestJS, doar alt build
entry și alt subdomeniu DNS.

## Ce arată panelul

**Per client (tenant):**

- Plan activ + modul(e) active (din `tenant_modules`)
- ID de sistem (`tenants.id`)
- Istoric încasări Stripe/Netopia (din `payments`, nou)
- Număr utilizatori activi (din `users`, deja existent)
- Consum AI (sumă `usage_events` filtrat pe `module_code = 'ai'`)
- Timp petrecut în aplicație + interval orar de utilizare (sursă:
  PostHog, nu tabelele de business — vezi mai jos)
- Data creării contului (`tenants.created_at`)
- Status: trial / activ / restanță (`past_due`) / anulat

**Agregat, la nivel de platformă:**

- MRR/ARR (sumă `payments` reușite, recurente, normalizate lunar)
- Churn (rată `tenant_modules` anulate / active, pe fereastră de timp)
- Conversie trial → plătitor
- Adopție module (distribuția `tenant_modules` pe `module_code`)
- Listă clienți cu restanțe (`payments`/`tenant_modules` status
  `past_due`)
- Conversie demo AI public → cont nou (vezi mai jos, necesită corelare
  sesiune anonimă → tenant nou, de proiectat separat când se ajunge la
  implementare — nu e trivial, session id-ul demo-ului public trebuie
  purtat prin fluxul de signup ca să poată fi corelat)

## De ce PostHog self-hosted, nu construit de la zero

Timpul petrecut în aplicație și intervalul orar de utilizare sunt date
comportamentale (evenimente de sesiune), nu date de business — construirea
lor de la zero (colectare, agregare, dashboard) ar fi exact genul de
„cumpără ce nu diferențiază produsul" din `docs/architecture.md`. PostHog
self-hosted (open-source, instalabil pe același Hetzner, deci fără cost de
licență și fără date ieșite din UE) acoperă asta nativ — panelul admin fie
afișează direct dashboard-uri PostHog, fie le interoghează prin API-ul lui
pentru statisticile care intră în tabelul de mai sus. Tabelele proprii
(`payments`, `tenant_modules`, `usage_events`) rămân sursa de adevăr
pentru tot ce ține de facturare/acces — PostHog nu înlocuiește nimic din
`docs/data-model.md`, doar completează partea comportamentală pe care
niciun tabel de business nu trebuie să o țină.

## Ce NU intră acum

- Editare directă a datelor de business ale unui tenant din panel (ex.
  corectarea unei facturi) — panelul e read-only pe datele operaționale;
  orice acțiune care schimbă starea unui tenant (activare/dezactivare
  modul, rambursare) trece tot prin fluxurile existente (webhook,
  suport), nu printr-un buton nou în admin, ca să nu ocolească regula #4.
- Corelarea exactă demo AI → semnal de conversie (rămâne de proiectat
  separat, notă mai sus).
- Rol granular în `platform_admins` dincolo de `admin`/`viewer` (permisiuni
  fine per secțiune) — se adaugă doar dacă echipa crește dincolo de
  câțiva oameni.
