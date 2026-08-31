# Portal Clienți — specificație funcțională

Extensie construită alături de Modulul 1 (Facturare), nu modul de business
separat cu domeniu propriu — dar cu identitate, schemă și reguli de
izolare proprii, suficient de sensibile cât să merite propriul fișier și
propriul agent de verificare (`customer-portal-guardian`).

## Scop și poziționare

La fiecare factură emisă (`status = issued`), clientul de pe factură
primește o notificare (email, Resend) cu un link către portal, unde vede
toate facturile lui de la firma respectivă și statusul plăților
înregistrate. Rol dublu:

1. **Valoare pentru tenant** — mai puține „unde e factura mea" pe email/
   telefon, imagine profesională, colectare mai rapidă (clientul vede
   clar ce a rămas neplătit).
2. **Motor de creștere a bazei de utilizatori** — fiecare factură emisă de
   orice tenant de pe platformă generează un utilizator de portal
   potențial. Cu cât mai mulți tenanți emit facturi prin platformă, cu
   atât mai mulți destinatari ajung să aibă cont — iar un destinatar care
   e el însuși o firmă e un lead calificat pentru un cont de tenant nou.

## Identitate — de ce NU e scoped strict per tenant

Un `portal_user` e o identitate **unică pe toată platforma** (după email),
nu una recreată separat pentru fiecare tenant care îi trimite facturi.
Motivul e chiar obiectivul de mai sus: dacă „Popescu SRL" primește facturi
de la trei tenanți diferiți ai platformei, vrem un singur cont care
agregă tot — nu trei conturi disjuncte, fără nicio legătură între ele. Un
cont fragmentat pe tenant ar anula exact efectul de rețea care face
portalul valoros ca motor de achiziție.

Identitatea globală nu înseamnă acces global — vezi „Regula de izolare"
mai jos. Un `portal_user` vede DOAR facturile pentru care are o legătură
explicit verificată cu un `(tenant_id, customer_id)`, niciodată tot ce
există pe platformă cu emailul lui.

## Schema de date

```sql
-- Identitate unică de portal, pe toată platforma (nu per tenant)
CREATE TABLE portal_users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT NOT NULL UNIQUE,
  name        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Legătura verificată dintre un portal_user și o relație client-tenant
-- reală (o factură emisă pe numele lui, la tenant-ul respectiv)
CREATE TABLE portal_user_links (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_user_id UUID NOT NULL REFERENCES portal_users(id),
  tenant_id      UUID NOT NULL REFERENCES tenants(id),
  customer_id    UUID NOT NULL REFERENCES customers(id),  -- din invoicing-spec.md
  verified_at    TIMESTAMPTZ,   -- NULL = invitație netrimisă/neconfirmată încă
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, customer_id)
);

-- Token-uri de autentificare fără parolă (magic link), cu expirare scurtă
CREATE TABLE portal_login_tokens (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_user_id UUID NOT NULL REFERENCES portal_users(id),
  token_hash     TEXT NOT NULL UNIQUE,   -- token-ul brut nu se stochează niciodată
  expires_at     TIMESTAMPTZ NOT NULL,   -- scurt: 15-30 minute
  used_at        TIMESTAMPTZ,            -- NULL = nefolosit încă; folosit o singură dată
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

`modules` capătă un rând nou: `code = 'customer-portal'`,
`billing_type = 'flat'`. Se înregistrează în catalog din motive de
tracking/adopție (aceeași infrastructură de `tenant_modules`/
`usage_events` deja existentă), nu pentru că e taxat separat — vezi
„Monetizare" mai jos.

## Flux de notificare (declanșat de aceeași tranziție ca e-Factura)

1. La `invoices.status = issued`: caută `portal_user_links` pentru
   `(tenant_id, customer_id)` al facturii.
2. Dacă nu există link: creează unul (`verified_at = NULL`), creează sau
   reidentifică `portal_users` după email-ul din `customers`, trimite
   email „ai o factură nouă — confirmă contul" cu magic link.
3. Dacă există link deja verificat: trimite direct „factură nouă
   disponibilă" cu magic link direct către acea factură.
4. Accesarea link-ului validează tokenul din `portal_login_tokens`
   (nefolosit, neexpirat), marchează `used_at`, marchează
   `portal_user_links.verified_at` dacă era gol, deschide sesiunea.

Declanșarea e automată, la aceeași tranziție de status care pornește și
transmiterea e-Factura (`docs/invoicing-spec.md`) — un singur punct de
intrare în ciclul de viață al facturii, nu fluxuri paralele care pot
ajunge desincronizate.

## Autentificare — magic link, nu parolă

Un portal user e un utilizator ocazional (verifică o factură din când în
când, la tenanți diferiți) — cere-i o parolă e frecare inutilă și o sursă
de suport („mi-am uitat parola"). Autentificare exclusiv prin link primit
pe email, cu token cu expirare scurtă (15-30 minute), cu o singură
folosire. Niciun cont/parolă de gestionat pentru portal user.

## Regula de izolare (echivalentul `tenant_id` pentru portal — CRITICĂ)

Diferă de restul platformei: aici nu exclude un tenant, exclude accesul
la orice altceva în afara relațiilor explicit verificate ale unui portal
user. Regulă obligatorie: orice query pentru facturile vizibile unui
portal user pornește **exclusiv** de la `portal_user_links` cu
`verified_at IS NOT NULL` ale sesiunii curente (rezolvate din
token-ul de autentificare, niciodată dintr-un `tenant_id`/`customer_id`
primit ca parametru de la client). Un endpoint care acceptă `tenant_id`
sau `customer_id` direct din query/body pentru un portal user e o breșă
IDOR (un portal user ar putea încerca alt UUID și vedea facturile altcuiva)
— verificat de `customer-portal-guardian`, severitate BLOCANT.

## Monetizare

- **Portal user (destinatarul facturii) — mereu gratuit.** Nu se taxează
  niciodată accesul unei persoane la propriile ei facturi primite — ar
  contrazice exact motivul pentru care există portalul (motor de creștere
  a bazei de utilizatori, nu produs de sine stătător).
- **Tenant (emitentul) — funcționalitatea de bază inclusă gratuit din
  pachetul Start**: vizualizare facturi + status de plată pentru clienții
  lui. Cost mic de operare, diferențiator real față de Saga/WinMentor
  (niciunul nu oferă asta nativ).
- **Funcționalități avansate — add-on plătit, viitor, la cerere
  confirmată, nu construit speculativ acum**: buton de plată online
  integrat (Stripe/Netopia) direct din portal, portal cu branding propriu
  al tenant-ului (logo, subdomeniu), remindere automate de plată către
  clienți întârziați.
- **Motor de cross-sell, direcție de urmărit, neconstruit acum**: un
  portal user care e el însuși o firmă (are CUI) poate primi, opțional,
  un CTA discret de tipul „administrează-ți propria facturare" —
  conversie spre un cont de tenant nou. Doar documentat ca intenție —
  construiește-l când există date că oamenii chiar dau click, nu
  speculativ.

## Relație cu e-Factura

Portalul nu înlocuiește e-Factura — completează. e-Factura/SPV rămâne
canalul legal obligatoriu pentru B2B/B2C cu CUI (vezi
`docs/invoicing-spec.md`, secțiunea „e-Factura ANAF"). Portalul adaugă o
experiență mai prietenoasă, mai ales acolo unde SPV nu ajută:
consumatori finali fără obligații e-Factura, sau clienți care oricum
preferă o interfață vizuală în locul unui XML validat oficial.

## Ce NU intră acum

Plată online din portal, portal cu branding propriu (white-label),
dashboard consolidat pentru un portal user cu facturi de la mulți
tenanți simultan, remindere automate de plată, orice logică de conversie
portal→tenant nou — toate rămân idei documentate, nu construite, până la
cerere confirmată (același principiu ca restul roadmap-ului 5+).
