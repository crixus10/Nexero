# Schema de date — entitlements

Citit la nevoie de orice modul care adaugă o rută nouă protejată de plată,
sau de `plan-guardian`/`logic-reviewer` la verificare. Sursa de adevăr
pentru tot ce ține de „ce modul are activ o firmă”.

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
```

Fiecare modul de business (facturi, stocuri etc.) are propriile tabele,
separate de acestea, referind doar `tenant_id`. Nu adăuga coloane de
business în `tenant_modules` — el rămâne strict despre acces și facturare.

## Tiparul de verificare acces (guard)

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
    const tenantId = req.tenant.id; // setat de auth middleware

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

## Fluxul complet

1. Client alege modul + plan (UI) → 2. Checkout Stripe/Netopia → 3. Webhook
plată confirmată → 4. `tenant_modules.status = active` (sau `past_due` /
`canceled` din eșec) → 5. `ModuleGuard` verifică la fiecare request → 6a.
200 OK, acces permis / 6b. 403, modul inactiv → 7. (dacă metered)
interceptor scrie în `usage_events` → 8. job lunar generează factură de
consum.
