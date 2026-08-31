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
duplicate aici). **Notă pe această ultimă migrare**: SQL-ul a fost scris
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

-- Utilizatori care se autentifică (login) — vezi secțiunea Autentificare
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

`users` e minimal, deliberat: un user aparține unei singure firme
(`tenant_id`), nu mai multora. Nu acoperă cazul unui cabinet contabil care
lucrează pentru mai mulți clienți (asta ar cere un tabel de asociere
many-to-many) — de construit doar când apare cerința reală, per regulile
din `docs/roadmap.md`, nu speculativ acum.

## Autentificare (JWT)

Implementare: `src/auth/` (nucleu, ca `src/prisma/` — nu e modul de
business, nu stă în `src/modules/`).

- `POST /auth/login` — primește `{ email, password }`, verifică parola cu
  `bcryptjs` (`compare` contra `users.password_hash`), emite un JWT.
- Payload JWT: `{ sub: user.id, tenantId: user.tenantId }` — `sub` e
  convenția standard pentru id-ul subiectului.
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
Migrare: `prisma/migrations/20260831171502_add_user_roles/`.

**Două niveluri de rol, nu unul — nu le confunda:**

- `users.role` e rolul **global, pe companie** (gestiune utilizatori,
  restricționează `src/users/`) — grosier, un singur enum valabil pentru
  orice modul: `owner | admin | accountant | operator`.
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
  `users.role`. Folosit azi doar pe `UsersController` (`src/users/`).
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
