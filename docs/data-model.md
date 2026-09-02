# Schema de date — entitlements

Citit la nevoie de orice modul care adaugă o rută nouă protejată de plată,
sau de `plan-guardian`/`logic-reviewer` la verificare. Sursa de adevăr
pentru tot ce ține de „ce modul are activ o firmă”.

**Implementare executabilă:** `prisma/schema.prisma` (ORM: Prisma, ales în
locul TypeORM — migrări explicite versionate + client 100% tipat, vezi
justificarea în istoricul sesiunii). Migrări (în ordine):
`20260826164140_init_entitlements` (schema inițială),
`20260826165855_add_fk_indexes` (indici lipsă pe FK-uri),
`20260826171424_add_users` (tabela `users`, pentru autentificare),
`20260827083021_add_processed_webhook_events` (idempotență webhook-uri —
vezi secțiunea „Tiparul de activare” mai jos) și
`20260827084922_add_last_event_at_and_subscription_unique` (gardă de
ordonare pe evenimente Stripe + `@@unique` pe `stripe_subscription_id`) și
`20260827150000_add_invoicing_schema` (cele 7 tabele ale Modulului 1 —
`customers`, `products`, `tax_codes`, `invoice_series`, `invoices`,
`invoice_lines`, `invoice_audit_log` — schema completă, motivația fiecărui
câmp și maparea SAF-T: `docs/invoicing-spec.md`/`docs/saft-mapping.md`, nu
duplicate aici; `customers` redenumit ulterior **`companies`** de migrarea
`20260901160000_add_crm_module` — RENAME, nu DROP+CREATE — la mutarea
nomenclatorului de clienți în Modulul 4 (CRM), vezi `docs/crm-spec.md`). **Notă pe această ultimă migrare**: SQL-ul a fost scris
inițial manual și aplicat/validat cu `psql` împotriva unei baze reale
(replicând întreg istoricul de migrări anterioare), pentru că mediul în
care a fost creată nu avea acces la `binaries.prisma.sh`. **Validat ulterior
și de motorul Prisma**: `npx prisma migrate dev` rulat local (26.08.2026) a
răspuns „Already in sync, no schema change or pending migration found” —
zero drift confirmat între `schema.prisma` și migrarea aplicată, deci
migrarea e definitivă, nu doar validată manual. SQL-ul de mai jos descrie
conceptul; schema reală, cu `CHECK`-urile incluse, e în acele fișiere — nu
le regenera de la zero, extinde-le cu `prisma migrate dev`.

Generator: `prisma-client-js` (clasic, motor binar) — **deliberat, nu**
noul generator `prisma-client` (WASM/ESM), care rupe Jest fără flag-uri
experimentale și complică inutil build-ul Nest dacă i se dă un `output`
custom în `src/`. Fără `output` în schema — clientul se generează implicit
în `node_modules/@prisma/client`, importabil ca pachet normal
(`import { PrismaClient } from '@prisma/client'`); regenerat automat la
`npm install` (script `postinstall`) sau manual via `npx prisma generate`.
Injectabil în orice modul via `PrismaService` (`src/prisma/`, modul
global — nu reimporta manual).

## Tabele centrale

```sql
-- Firmele client (tenants)
CREATE TABLE tenants (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  cui         TEXT UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Catalogul de module disponibile pe platformă
CREATE TABLE modules (
  code          TEXT PRIMARY KEY,   -- 'invoicing', 'inventory', ...
  name          TEXT NOT NULL,
  billing_type  TEXT NOT NULL
    CHECK (billing_type IN ('flat','metered','seat')),
  released_at   DATE
);

-- Planurile de preț pentru fiecare modul
CREATE TABLE plans (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_code     TEXT NOT NULL REFERENCES modules(code),
  name            TEXT NOT NULL,    -- 'start' | 'business' | 'enterprise'
  price_cents     INTEGER NOT NULL,
  currency        TEXT NOT NULL DEFAULT 'EUR',
  included_quota  INTEGER,          -- NULL = nelimitat
  billing_period  TEXT NOT NULL DEFAULT 'monthly'
);

-- Ce module are activ fiecare firmă — sursa de adevăr pentru acces
CREATE TABLE tenant_modules (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              UUID NOT NULL REFERENCES tenants(id),
  module_code            TEXT NOT NULL REFERENCES modules(code),
  plan_id                UUID NOT NULL REFERENCES plans(id),
  status                 TEXT NOT NULL
    CHECK (status IN ('trial','active','past_due','canceled')),
  trial_ends_at          TIMESTAMPTZ,
  current_period_end     TIMESTAMPTZ,
  stripe_subscription_id TEXT,
  UNIQUE (tenant_id, module_code)
);

-- Evenimente de consum, pentru module taxate pe volum
CREATE TABLE usage_events (
  id           BIGSERIAL PRIMARY KEY,
  tenant_id    UUID NOT NULL REFERENCES tenants(id),
  module_code  TEXT NOT NULL REFERENCES modules(code),
  event_type   TEXT NOT NULL,      -- ex: 'invoice_issued'
  quantity     INTEGER NOT NULL DEFAULT 1,
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Utilizatori care se autentifică (login) — vezi secțiunea Autentificare.
-- Forma AFIȘATĂ AICI e starea INIȚIALĂ (2026-08-26); users a primit apoi
-- full_name/role/is_active prin ALTER (secțiunea RBAC), iar tenant_id/role
-- au fost eliminate din nou de migrarea multi-firmă (secțiunea „Multi-
-- firmă" mai jos) — starea REALĂ curentă e cea din `prisma/schema.prisma`:
-- users(id, email UNIQUE, password_hash, full_name, is_active, created_at),
-- FĂRĂ tenant_id/role. Nu recopia acest bloc ca sursă de adevăr a schemei
-- curente — e păstrat doar ca istoric al primei migrări.
CREATE TABLE users (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id),
  email          TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Fiecare modul de business (facturi, stocuri etc.) are propriile tabele,
separate de acestea, referind doar `tenant_id`. Nu adăuga coloane de
business în `tenant_modules` — el rămâne strict despre acces și facturare.

`users` e independent de firmă din construcție — un user nu are
`tenant_id`/`role` proprii, accesul lui la una sau mai multe firme se ține
separat, în `user_tenant_access` (vezi secțiunea „Multi-firmă" mai jos).
Decizie: 2026-09-02, cerință reală confirmată (Sorin gestionează personal
mai multe firme prin același cont; acces pentru clienți externi ai unei
firme de contabilitate rămâne deschis pentru mai târziu, expus prin API,
nu prin acest mecanism).

## Coduri auto-generate (`code_sequences`)

```sql
-- Contor secvențial per tenant + tip de entitate, pentru coduri
-- auto-generate afișate în UI (CLI-0001, PRD-0001, CTC-0001,
-- DEAL-2026-0001...) — NU pentru numerotarea legală de facturi
-- (invoice_series.next_number, vezi docs/invoicing-spec.md), care are
-- propria garanție „fără goluri" + tranzacție comună cu inserarea facturii.
CREATE TABLE code_sequences (
  tenant_id    UUID NOT NULL REFERENCES tenants(id),
  entity_type  TEXT NOT NULL,   -- 'company' | 'product' | 'contact' | 'deal:2026' | ...
  next_value   INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (tenant_id, entity_type)
);
```

Mecanism de NUCLEU (`src/common/code-sequence.service.ts`,
`CodeSequenceService`, modul global — injectabil din orice modul de
business fără import explicit, ca `PrismaService`), reutilizat azi de
`products` (modulul Facturare) și `companies`/`contacts`/`deals` (modulul
CRM — `companies` a trecut în proprietatea CRM la mutare, consumat prin FK
de Facturare, vezi `docs/crm-spec.md`). Alocare atomică prin `upsert` cu
`{ nextValue: { increment: 1 } }` (INSERT ... ON CONFLICT DO UPDATE la
nivel de Postgres) — niciodată `MAX(cod)+1` (cursă la concurență).
`entity_type` poate include un sufix variabil (ex. `deal:2026`) pentru o
secvență care se resetează logic per an — tratat ca o cheie distinctă,
nu o coloană separată.

Orice modul nou care are nevoie de un cod mnemonic auto-generat
folosește acest serviciu, nu reinventă propriul contor.

## Autentificare (JWT)

Implementare: `src/auth/` (nucleu, ca `src/prisma/` — nu e modul de
business, nu stă în `src/modules/`).

- `POST /auth/login` — primește `{ email, password }`, verifică parola cu
  `bcryptjs` (`compare` contra `users.password_hash`), emite un JWT.
- Payload JWT: `{ sub: user.id, tenantId }` — `sub` e convenția standard
  pentru id-ul subiectului. `tenantId` vine ACUM din `user_tenant_access`
  (userul nu mai are `tenantId` propriu — vezi secțiunea „Multi-firmă" mai
  jos) și e OPȚIONAL în payload: absent doar pe tokenul „pre-tenant", emis
  când userul are acces la mai multe firme și încă n-a ales una.
- Secretul de semnare vine din `JWT_SECRET` (env) — niciodată hardcodat.
  Vezi `.env.example`.
- `JwtAuthGuard` (`src/auth/jwt-auth.guard.ts`) verifică tokenul din header
  `Authorization: Bearer <token>` cu `JwtService.verifyAsync` (fără
  Passport — inutil pentru un caz atât de simplu) și atașează
  `req.user = { userId, tenantId }`.
- **Orice guard viitor care are nevoie de `tenant_id` (inclusiv
  `ModuleGuard` de mai jos) îl citește din `req.user.tenantId`**, nu din
  `req.tenant.id` — convenția a fost fixată aici acum că auth chiar există.
- **`JwtAuthGuard` e GLOBAL** (`APP_GUARD` în `auth.module.ts`) — rulează
  implicit pe orice rută din orice modul, prezent sau viitor, fără să fie
  nevoie de `@UseGuards` pe fiecare controller nou. O rută care chiar
  trebuie să rămână neautentificată (ex: `/auth/login`, health-check-ul de
  la `/`) se marchează explicit cu `@Public()`
  (`src/auth/public.decorator.ts`) — altfel un modul de business nou e
  protejat automat din prima zi, fără să se poată "uita" adăugarea unui
  guard. **Ce garantează guard-ul**: dacă handler-ul rulează,
  `req.user.tenantId` există și vine dintr-un JWT valid. **Ce NU
  garantează**: că interogările Prisma din handler chiar filtrează după
  el — regula #6 rămâne responsabilitatea codului din fiecare modul,
  guard-ul e doar precondiția care o face posibilă, nu o aplică mecanic.
- User de test pentru dezvoltare: `prisma/seed.ts`, rulat cu
  `npx prisma db seed` (configurat în `prisma7.config.ts`,
  `migrations.seed`). Idempotent — sigur de rulat de mai multe ori.
- **Securitate**: `bcrypt.compare` rulează necondiționat, inclusiv pentru
  email inexistent (contra un `DUMMY_HASH` fix) — altfel timpul de răspuns
  diferă măsurabil și devine oracol de enumerare a email-urilor (deci a
  firmelor client). Nu "optimiza" ramura de user inexistent să sară peste
  compare.
- **Rate limiting**: `ThrottlerGuard` (`@nestjs/throttler`) doar pe
  `POST /auth/login`, 5 încercări/minut, cheie implicit pe `req.ip`.
  **Necesită `app.set('trust proxy', 1)` în `src/main.ts`** — producția
  (Hetzner, reverse proxy în față) altfel vede toate cererile venind de la
  IP-ul proxy-ului, iar limita ajunge împărțită între toate firmele client
  (un tenant care greșește parola blochează login-ul tuturor). Dacă
  topologia reală de producție adaugă un hop în plus (ex: Cloudflare),
  valoarea `1` trebuie recalibrată.

## Tiparul de verificare acces (guard)

**Implementare reală** (nu doar pseudocod): `src/entitlements/` — nucleu, ca
`src/auth/`, `src/prisma/`, nu modul de business.
- `EntitlementsService.getActive(tenantId, moduleCode)` — interpretare
  "activ" fixată explicit (nescrisă literal mai sus): `status = 'active'`
  SAU `status = 'trial'` cu `trial_ends_at` încă neexpirat (sau nesetat).
  `past_due`/`canceled` NU dau acces.
- `ModuleGuard` e **global** (`APP_GUARD` în `entitlements.module.ts`),
  exact ca `JwtAuthGuard` — `@RequireModule('x')` funcționează singur pe
  orice rută, fără `@UseGuards` explicit (tiparul de mai jos e literă,
  nu doar exemplu). **Ordine obligatorie**: `AuthModule` importat înaintea
  `EntitlementsModule` în `app.module.ts` — `ModuleGuard` citește
  `req.user.tenantId`, atașat de `JwtAuthGuard`. Verificare defensivă
  inclusă (`if (!request.user) throw UnauthorizedException`) — nu se
  bazează orbește pe ordine, ca o reordonare accidentală să dea 401 clar,
  nu un 500 nedeslușit.
- **`@RequireModule` citește metadata DOAR de pe metodă
  (`ctx.getHandler()`), NICIODATĂ de pe clasă** — spre deosebire de
  `@Public()`/`@Protected()` din `src/auth/`, care verifică și clasa
  (`getAllAndOverride([handler, class])`). Pus pe o clasă întreagă,
  `@RequireModule` nu aruncă nicio eroare, dar nu face NIMIC — guard-ul nu
  găsește metadata pe handler și lasă cererea să treacă necondiționat,
  fără verificare de plată, silențios. Folosește-l mereu pe fiecare
  metodă protejată individual, niciodată la nivel de clasă.
- Exemplu real de `@RequireModule` în uz: `GET /invoices`
  (`src/modules/invoicing/`) — schelet minim, fără logică de facturare,
  vezi `docs/roadmap.md`. Endpoint-ul temporar de verificare
  (`/entitlements-test/ping`) a fost șters odată ce a apărut această rută
  reală — nu mai există un modul „test" separat în `prisma/seed.ts`.
  Verificare lanțului complet (401 fără token → 403 fără entitlement → 200
  cu entitlement activ): `test/invoicing.e2e-spec.ts`.

```typescript
@Injectable()
export class ModuleGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private entitlements: EntitlementsService,
  ) {}

  async canActivate(ctx: ExecutionContext) {
    const mod = this.reflector.get<string>(
      'module', ctx.getHandler(),
    );
    if (!mod) return true; // ruta nu ține de un modul plătit

    const req = ctx.switchToHttp().getRequest();
    const tenantId = req.user.tenantId; // atașat de JwtAuthGuard, src/auth/

    const ent = await this.entitlements.getActive(
      tenantId, mod,
    );
    if (!ent) {
      throw new ForbiddenException(
        `Modulul "${mod}" nu e activ pentru firmă.`,
      );
    }
    req.entitlement = ent; // util pentru metering ulterior
    return true;
  }
}
```

Utilizare pe orice rută nouă protejată de plată:

```typescript
@RequireModule('invoicing')
@Post('invoices')
createInvoice(@Body() dto: CreateInvoiceDto) {
  return this.invoicingService.create(dto);
}
```

## Tiparul de activare (doar din webhook, niciodată din UI)

```typescript
@Post('webhooks/stripe')
async handleStripeWebhook(@Req() req) {
  const event = stripe.webhooks.constructEvent(...);

  if (event.type === 'checkout.session.completed') {
    const { tenantId, moduleCode, planId } =
      event.data.object.metadata;

    await this.tenantModules.upsert({
      tenantId, moduleCode, planId,
      status: 'active',
      stripeSubscriptionId:
        event.data.object.subscription,
    });
  }

  if (event.type === 'invoice.payment_failed') {
    await this.tenantModules.setStatusBySub(
      event.data.object.subscription, 'past_due',
    );
  }
}
```

Webhook-ul trebuie tratat idempotent (Stripe poate retrimite același
eveniment) — verifică `event.id` deja procesat înainte de upsert, altfel
riști facturare/activare dublă.

**Implementare reală**: `src/payments/` — nucleu ("billing" din
`docs/roadmap.md`), la fel ca `src/auth/`, `src/prisma/`,
`src/entitlements/`.

- `POST /webhooks/stripe` (`StripeWebhookController`) — `@Public()`
  obligatoriu (Stripe nu trimite JWT-ul nostru; autenticitatea vine din
  `stripe.webhooks.constructEvent`, care verifică semnătura criptografică
  din header-ul `Stripe-Signature` contra `STRIPE_WEBHOOK_SECRET`).
  Throttling propriu (30/min, mai permisiv decât cele 5/min de pe
  `/auth/login` — Stripe poate trimite rafale).
- **Body brut obligatoriu**: `NestFactory.create(AppModule, { rawBody: true })`
  în `main.ts` — semnătura Stripe se calculează pe bytes-ii bruți ai
  request-ului, nu pe JSON-ul reparsat. Fără asta, verificarea eșuează
  mereu (fals-negativ pe payload-uri legitime).
- **Idempotență reală, nu doar „verifică înainte de upsert”**: tabelă nouă
  `processed_webhook_events` (id = `event.id`, PRIMARY KEY). Inserarea în
  ea și efectul de business (upsert pe `tenant_modules`) se fac în
  **aceeași tranzacție** (`prisma.$transaction`) — un conflict `UNIQUE`
  pe `event.id` (Prisma error `P2002`) înseamnă "deja procesat", ignorat
  silențios (răspuns tot `200`, ca Stripe să nu reîncerce la infinit).
  Tranzacția (nu un `findUnique` separat înainte) contează sub concurență
  reală — două livrări simultane ale aceluiași `event.id` nu au o
  fereastră TOCTOU în care ambele să treacă de verificare.
- **Metadata incompletă pe `checkout.session.completed` → ARUNCĂ, nu
  loghează și ignoră.** Un client debitat real de Stripe, dar cu
  `tenantId`/`moduleCode`/`planId` lipsă din `metadata`, nu trebuie marcat
  silențios "procesat" fără activare — asta ar însemna bani luați, acces
  neacordat, și nimeni nu observă. Aruncarea face tranzacția rollback
  (evenimentul NU rămâne în `processed_webhook_events`) — Stripe primește
  5xx, reîncearcă și marchează eșecul vizibil în dashboard-ul lor.
- **Gardă de ordonare** (`tenant_modules.last_event_at`): Stripe NU
  garantează livrare ordonată a webhook-urilor. Orice scriere pe
  `tenant_modules` din acest serviciu e condiționată de
  `last_event_at IS NULL OR last_event_at <= event.created` — un eveniment
  mai vechi, sosit după unul mai nou, e ignorat (nu suprascrie starea).
  `<=`, nu `<` — `event.created` are granularitate de 1 secundă, iar două
  evenimente distincte pot cădea în aceeași secundă (descoperit chiar
  printr-un test e2e propriu, nu doar teoretic).
  **Risc cunoscut, acceptat deliberat la acest stadiu** (volum mic, fără
  clienți reali încă): `<=` reduce fereastra de race la "aceeași secundă",
  nu o elimină — două evenimente DISTINCTE cu `event.created` identic
  (plauzibil exact în cazuri înlănțuite rapid: retry de plată urmat
  aproape instant de un nou checkout) sunt departajate doar de ordinea în
  care ajung la server, nu de ordinea cronologică reală Stripe (care are
  precizie sub-secundă, nefolosită aici). Dacă volumul de evenimente
  crește, de reconsiderat un tiebreak determinist (ex: la egalitate pe
  `last_event_at`, o stare "mai defensivă" ca `past_due`/`canceled` să nu
  poată fi suprascrisă de `active` din aceeași secundă) — nu implementat
  acum, ar fi speculativ fără date reale de volum/coliziuni.
- `tenant_modules.stripe_subscription_id` are `@@unique` (nu doar index) —
  `invoice.payment_failed` face `updateMany` pe acea coloană; fără
  unicitate, o eventuală coliziune ar propaga `past_due` pe mai multe
  rânduri deodată, posibil alt tenant.
- **Evenimente gestionate** (găsit incomplet la un audit holistic —
  `past_due` nu avea nicio cale de revenire): `checkout.session.completed`
  → `active` (+ scrie `planId`/`stripeSubscriptionId`, singurul eveniment
  cu metadata pentru o primă activare); `invoice.payment_failed` →
  `past_due`; `invoice.payment_succeeded` → **`active`** (recuperare —
  fără el, un client care își actualizează cardul și plătește efectiv
  rămâne blocat din modul până la intervenție manuală în DB);
  `customer.subscription.deleted` → **`canceled`** (anulare explicită,
  parte din fluxul documentat mai sus, dar nescrisă de niciun cod până la
  acest audit). Ultimele trei folosesc același tipar (`updateStatusBySubscription`
  în `stripe-webhook.service.ts`): `updateMany` pe `stripeSubscriptionId`,
  cu aceeași gardă de ordonare pe `last_event_at`.
- `StripeWebhookService` — **deliberat NEexportat** din
  `PaymentsModule` — niciun alt modul nu-l poate injecta și "activa" un
  entitlement direct. Aplică regula #4 din CLAUDE.md structural, nu doar
  ca o convenție de urmat.
- Env: `STRIPE_SECRET_KEY` (mod test, `sk_test_...`),
  `STRIPE_WEBHOOK_SECRET` (`whsec_...`, din `stripe listen` sau dashboard).
  Vezi `.env.example`.
- Netopia: NU implementat încă — același tipar (webhook izolat, idempotent
  prin `processed_webhook_events`, `provider: 'netopia'`) se aplică atunci
  când apare cerința reală, per `docs/roadmap.md`.

## Fluxul complet

1. Client alege modul + plan (UI) → 2. Checkout Stripe/Netopia → 3. Webhook
plată confirmată → 4. `tenant_modules.status = active` (sau `past_due` /
`canceled` din eșec) → 5. `ModuleGuard` verifică la fiecare request → 6a.
200 OK, acces permis / 6b. 403, modul inactiv → 7. (dacă metered)
interceptor scrie în `usage_events` → 8. job lunar generează factură de
consum.

## RBAC — `users.role` (global) + `user_module_roles` (per-modul)

**Implementat** (nu doar schemă) — `src/users/` (management complet de
useri) + `src/rbac/` (guard-uri), nucleu, ca `src/auth/`, `src/entitlements/`.
Migrare: `prisma/migrations/20260831171502_add_user_roles/` — SUPRASCRISĂ
parțial de `20260902120000_user_tenant_access/` (secțiunea „Multi-firmă"
mai jos): rolul global NU mai stă pe coloana `users.role` (eliminată), ci
pe `user_tenant_access.role`, per pereche user-firmă. Restul acestei
secțiuni (nivelul per-modul, `user_module_roles`) rămâne neschimbat —
citește „global (pe companie)" mai jos ca „global pe FIRMA CURENTĂ", nu
ca o proprietate fixă a userului.

**Două niveluri de rol, nu unul — nu le confunda:**

- `users.role` (azi `user_tenant_access.role`, vezi nota de mai sus) e
  rolul **global, pe companie** (gestiune utilizatori, restricționează
  `src/users/`) — grosier, un singur enum valabil pentru orice modul:
  `owner | admin | accountant | operator`.
- Rolurile **per-modul** (ex. `invoicing:viewer/issuer/approver/admin`,
  documentate în `docs/invoicing-spec.md`) au nevoie de granularitate pe
  care un singur enum global n-o poate exprima — un `operator` global
  poate fi `invoicing:issuer` fără să fie și `invoicing:approver` (cerință
  de segregare a responsabilităților din invoicing-spec.md). De asta există
  tabelul `user_module_roles`, separat de coloana `role`. Fiecare modul își
  definește propriile valori valide de rol în propriul fișier de
  specificație (nu aici) — acest tabel e doar mecanismul comun de stocare,
  reutilizabil de orice modul viitor cu roluri granulare.

```sql
-- Extensie pe users (deja existent, vezi „Autentificare (JWT)" mai sus) —
-- coloane noi, nu tabel nou. users.email rămâne UNIQUE global, decizie deja
-- fixată prin implementare — nu redeschide la adăugarea acestor coloane.
-- Rol GLOBAL (companie), NU rolul per-modul de mai jos.
ALTER TABLE users ADD COLUMN full_name  TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN role       TEXT NOT NULL DEFAULT 'operator'
  CHECK (role IN ('owner','admin','accountant','operator'));
ALTER TABLE users ADD COLUMN is_active  BOOLEAN NOT NULL DEFAULT true;

-- Roluri per-modul — granularitate pe care users.role nu o poate exprima
-- (vezi nota de mai sus). Un user poate avea mai multe rânduri (mai multe
-- roluri) pe același modul, ex. viewer + issuer simultan; segregarea
-- issuer/approver cerută de docs/invoicing-spec.md se aplică la nivel de
-- serviciu (nu-i asigna pe amândouă aceluiași user), nu ca o constrângere
-- de schemă — un CHECK care ar interzice combinația ar trebui să cunoască
-- regulile fiecărui modul, ceea ce ar rupe izolarea de modul (regula #2).
CREATE TABLE user_module_roles (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id),
  user_id      UUID NOT NULL REFERENCES users(id),
  module_code  TEXT NOT NULL REFERENCES modules(code),
  role         TEXT NOT NULL, -- ex. 'invoicing:viewer' — valorile valide
                               -- sunt definite de fiecare modul în propriul
                               -- fișier de specificație, nu aici
  granted_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id, module_code, role)
);
```

**Guard-uri** (`src/rbac/`) — la fel ca `ModuleGuard`, citire LIVE din DB la
fiecare request (niciodată din JWT — dacă un owner retrogradează pe cineva,
îi revocă un rol de modul, SAU îl dezactivează (`isActive: false`), efectul
e imediat, nu așteaptă expirarea unui token deja emis — ambele guard-uri de
mai jos filtrează explicit `isActive: true`, nu doar rolul), globale
(`APP_GUARD`), no-op fără decorator, aceeași plasă defensivă
`if (!request.user)`:

- `GlobalRoleGuard` + `@RequireGlobalRole('owner', 'admin')` — verifică
  `users.role` (azi `user_tenant_access.role`, vezi secțiunea „Multi-firmă"
  mai jos — coloana `users.role` a fost eliminată). Folosit azi doar pe
  `UsersController` (`src/users/`).
- `ModuleRoleGuard` + `@RequireModuleRole('invoicing:issuer', ...)` —
  verifică `user_module_roles`, „oricare din" lista dată. Se pune
  ÎMPREUNĂ cu `@RequireModule('x')` pe același handler, nu în locul lui —
  primul verifică dacă firma are modulul activ, al doilea verifică CINE din
  firmă poate face acțiunea. Exemplu real:
  `src/modules/invoicing/invoices/invoices.controller.ts`.

`RbacModule` (`src/rbac/rbac.module.ts`) trebuie importat DUPĂ `AuthModule`
în `app.module.ts` — aceeași cerință de ordine ca `EntitlementsModule`.

**`owner` — regulă specială, în ambele capete ale ciclului de viață**
(fix logic-reviewer, audit holistic): un cont nou NU poate primi
`role: 'owner'` direct la creare (`POST /users` — `CreateUserDto` acceptă
doar `admin`/`accountant`/`operator`, vezi `CREATABLE_ROLES` în
`src/users/dto/create-user.dto.ts`) — un owner nou se obține DOAR prin
promovarea unui user existent (`PATCH /users/:id`, `UsersService.update()`),
și doar dacă apelantul e el însuși `owner` (verificat live, în aceeași
tranzacție). Fără ambele reguli, orice `admin` ar putea crea/auto-promova
la `owner` fără control — exact breșa găsită și corectată în această
sesiune. Simetric cu protecția „nu rămâne firma fără owner activ" (aceeași
metodă `update()`), tot sub tranzacție `Serializable`.

## Multi-firmă — un user poate accesa mai multe firme (`user_tenant_access`)

**Implementat** (nu doar schemă) — `src/auth/`, `src/rbac/`, `src/users/`.
Migrare: `prisma/migrations/20260902120000_user_tenant_access/`.

**Decizie (2026-09-02):** un cont/user poate ține evidența la mai multe
firme, cu rol propriu pe fiecare — nu doar cazul unui antreprenor cu mai
multe SRL-uri administrate din același login, ci și baza pentru orice
utilizator viitor cu acces la mai mult de o firmă. Scop limitat, explicit:
un singur user accesează mai multe tenanți pe care el însuși îi
administrează. NU acoperă acces încrucișat între conturi diferite (ex. un
cabinet de contabilitate extern autentificat separat, cu acces la firma
unui client care are propriul lui cont) — acel caz rămâne, deliberat,
în afara acestui mecanism; dacă apare cerere reală, se expune prin API
dedicat, nu prin extinderea `user_tenant_access`.

Înlocuiește `users.tenant_id` și `users.role` (coloanele adăugate în
`20260831171502_add_user_roles`) — `users` redevine identitate pură,
independentă de firmă.

```sql
-- Înlocuiește users.tenant_id (FK unic) și users.role (enum unic) —
-- accesul și rolul devin proprietăți ale relației user-firmă, nu ale
-- userului. users.email rămâne UNIQUE global (neschimbat).
ALTER TABLE users DROP COLUMN tenant_id;
ALTER TABLE users DROP COLUMN role;

CREATE TABLE user_tenant_access (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  role        TEXT NOT NULL
    CHECK (role IN ('owner','admin','accountant','operator')),
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, tenant_id)
);
```

Migrare de date: pentru fiecare `users` existent, se inserează un rând în
`user_tenant_access` din `(tenant_id, role)` de dinainte de migrare,
înainte de a elimina coloanele — o singură migrare Prisma, cu pasul de
backfill inclus (nu două migrări separate, ca să nu existe fereastră în
care userii n-au niciun rând de acces).

`users.is_active` RĂMÂNE pe `users` (nu s-a mutat) — e comutatorul GLOBAL
de cont (dezactivează login-ul peste tot, pe orice firmă), distinct de
`user_tenant_access.is_active` (revocă doar accesul la O firmă anume,
contul rămâne activ pe restul). Ambele guard-urile RBAC verifică pe
amândouă — vezi „Impact asupra RBAC" mai jos.

### Impact asupra autenticării (`src/auth/`) — schimbare de comportament

Azi, JWT conține `{ sub, tenantId }` fix, stabilit o singură dată la
login. Cu multi-firmă, „firma activă" devine o alegere explicită a
userului, nu o proprietate fixă a contului. `JwtPayload.tenantId` e acum
OPȚIONAL (`jwt-payload.interface.ts`) — lipsă doar pe tokenul „pre-tenant".

- `POST /auth/login` — verifică explicit și `users.is_active` (comutatorul
  GLOBAL de cont), cu ACELAȘI mesaj generic „Email sau parolă incorecte."
  ca parola greșită/emailul inexistent (fix logic-reviewer: altfel un cont
  dezactivat global ar fi rămas fără nicio verificare la login, expus doar
  la o presupunere nescrisă că user_tenant_access s-ar dezactiva în
  cascadă — ceea ce codul nu face). Dacă userul are acces la o singură
  firmă (cazul majoritar azi), comportament neschimbat: JWT emis direct cu
  acel `tenantId`, fără pas suplimentar. Dacă are acces la mai multe,
  login-ul returnează `{ accessToken, tenants }` — `accessToken` e un
  token „pre-tenant" (fără `tenantId`), `tenants` lista de firme
  (`user_tenant_access` unde `is_active`, cu `role`).
- `POST /auth/switch-tenant` (nou) — primește `tenantId` cerut, verifică
  LIVE din `user_tenant_access` (`user_id`, `tenant_id`, `is_active =
  true`, plus `users.is_active`) că userul chiar are acces, abia apoi
  emite un JWT nou cu acel `tenantId`. Verificarea server-side e
  obligatorie — niciodată încredere în ce trimite clientul fără citire din
  DB, altfel breșă IDOR (un user ar putea cere acces la o firmă la care nu
  e asociat). Acceptă și un token deja complet (userul își schimbă firma
  activă din mers, nu doar imediat după login) — marcată
  `@AllowPreTenant()` (`src/auth/allow-pre-tenant.decorator.ts`), singura
  rută din aplicație care acceptă un token fără `tenantId`.
- `JwtAuthGuard` respinge explicit orice token fără `tenantId` pe o rută
  FĂRĂ `@AllowPreTenant()` — precondiție obligatorie, nu doar convenție:
  fără acest refuz, un `tenantId` `undefined` ar ajunge într-un filtru
  Prisma `where: { tenantId: undefined }`, pe care Prisma îl IGNORĂ complet
  (nu-l tratează ca IS NULL), transformând orice query tenant-scoped
  într-o interogare cross-tenant. Verificată o singură dată aici, ca restul
  guard-urilor (`ModuleGuard`, `GlobalRoleGuard`, `ModuleRoleGuard`) să
  rămână neschimbate — pot presupune mereu `req.user.tenantId: string`.

### Impact asupra RBAC (`src/rbac/`)

`GlobalRoleGuard` (`@RequireGlobalRole`) citea până acum `users.role`
direct. Se schimbă să citească rolul din `user_tenant_access`, pentru
perechea `(userId, tenantId activ din JWT)` — live din DB, la fel ca azi
(niciodată din token), filtrând explicit `user_tenant_access.is_active`
ȘI `users.is_active` (RbacService.getGlobalRole). `ModuleRoleGuard`
(`user_module_roles`, care nu se schimbă structural — are deja `tenant_id`
propriu) capătă aceeași a doua condiție (`RbacService.hasAnyModuleRole`):
un user cu rânduri orfane în `user_module_roles` dintr-o firmă la care
accesul i-a fost revocat NU mai trece — cele două guard-uri globale aplică
acum ACELEAȘI garanții de bază, nu doar fiecare separat corectă (fix
rbac-guardian).

Regula „owner nu se auto-promovează, doar un owner existent promovează pe
altcineva" + „nu rămâne firma fără owner activ" (`UsersService.update()`,
tranzacție `Serializable`) se aplică identic, doar mutată de pe `users` pe
`user_tenant_access`, scopată pe `tenant_id`.

### Impact asupra managementului de useri (`src/users/`)

- `POST /users` — creează un user NOU (identitate globală + primul lui
  rând de acces, pe firma curentă). Eșuează cu 409 dacă email-ul există
  deja global — vezi nota de mai jos despre ce NU face acest endpoint.
- **Deliberat NEexpus**: o cale de a acorda acces la firma curentă unui
  user care EXISTĂ DEJA (alt cont, altă firmă), doar prin cunoașterea
  email-ului lui, apelabilă de orice owner/admin al firmei curente — fix
  plan-guardian (scope-creep): o astfel de rută ar depăși scopul
  decis mai sus („un singur user accesează mai multe tenanți pe care EL
  ÎNSUȘI îi administrează", NU acces acordat unilateral, fără
  consimțământ, de un tenant peste identitatea altcuiva). Azi, un al
  doilea rând de acces pentru un user existent se creează doar direct
  (seed/provisionare — la fel ca primul rând de acces al oricărui user,
  care nu are încă o API de auto-creare) — un flux self-service cu
  confirmare din partea contului țintă (invitație) e de construit separat,
  doar la cerere reală, nu speculativ acum.
- `PATCH /users/:id` — `fullName` scrie pe identitatea GLOBALĂ (`users`);
  `role`/`isActive` scriu pe rândul de acces al firmei curente
  (`user_tenant_access`), scopate ca înainte.
- `POST /users/:id/reset-password` — parola e identitate globală, dar
  ruta rămâne scopată pe firmă: verifică explicit un rând în
  `user_tenant_access` pentru `(tenantId, id)` înainte de scriere, altfel
  un owner/admin ar putea reseta parola oricărui user din platformă doar
  ghicindu-i id-ul (breșă IDOR, regula #6 din CLAUDE.md).

## Tabele suplimentare — admin platformă, plăți

Extensie propusă, nu încă implementată — de adăugat prin migrări Prisma
noi (`prisma migrate dev`), nu prin editarea migrărilor existente. Necesare
pentru Panelul Admin Intern (`docs/platform-admin-spec.md`).

```sql
-- Staff Mittani Solutions — NU un tenant, NU un client, fără tenant_id
CREATE TABLE platform_admins (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email          TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  full_name      TEXT NOT NULL,
  role           TEXT NOT NULL DEFAULT 'admin'
    CHECK (role IN ('admin','viewer')),
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at  TIMESTAMPTZ
);

-- Jurnal de încasări Stripe/Netopia — istoric, nu doar starea curentă din
-- tenant_modules. Scris EXCLUSIV din handler-ul de webhook existent
-- (src/payments/), în aceeași tranzacție cu upsert-ul pe tenant_modules —
-- același tipar de idempotență (processed_webhook_events) descris mai sus.
CREATE TABLE payments (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id),
  provider              TEXT NOT NULL CHECK (provider IN ('stripe','netopia')),
  provider_payment_id   TEXT NOT NULL,
  amount_cents          INTEGER NOT NULL,
  currency              TEXT NOT NULL DEFAULT 'RON',
  status                TEXT NOT NULL
    CHECK (status IN ('succeeded','failed','refunded','pending')),
  plan_code             TEXT NOT NULL,
  invoice_period_start  DATE,
  invoice_period_end    DATE,
  raw_payload           JSONB,
  received_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_payment_id)
);
```

`platform_admins` e tabelul care lipsește intenționat din regula „orice
query filtrează după `tenant_id`" (regula #6 din `CLAUDE.md`) — nu pentru
că e o excepție de conveniență, ci pentru că nu descrie deloc un tenant.
Detaliu complet al panelului care îl folosește: `docs/platform-admin-spec.md`.

Schemele modulelor Portal Clienți (`portal_users`, `portal_user_links`,
`portal_login_tokens`) și add-on AI (`purchase_documents`) stau în propriile
fișiere de specificație (`docs/customer-portal-spec.md`,
`docs/ai-addon-spec.md`), nu aici — urmează convenția „fiecare modul de
business are propriile tabele, separate de nucleul de entitlements" de mai
sus.
