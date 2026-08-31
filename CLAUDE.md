# CLAUDE.md — context permanent pentru mini ERP SaaS

Acest fișier se încarcă automat în fiecare sesiune Claude Code. Scop: elimină
nevoia de a re-explica sau a re-decide ce e deja stabilit mai jos — asta e
economia reală de tokeni, nu lungimea acestui fișier. Dacă lipsește un
detaliu, citește fișierul relevant din `docs/` înainte să întrebi sau să
presupui. Nu re-explora tot repo-ul pentru decizii deja fixate aici.

## Produsul

Mini ERP modular pentru IMM-uri din România. Fiecare modul se vinde separat,
pe abonament, de la lansarea lui — nu se așteaptă suita completă. Piață
țintă: micro-IMM → IMM mediu → cabinete contabile. Poziționare față de
Saga/WinMentor/Nexus: `docs/pricing.md`.

## Stack fixat — nu propune alternative fără cerere explicită

- Backend: NestJS (Node/TypeScript) — **monolit modular**, NU microservicii.
- DB: PostgreSQL, schemă multi-tenant (`tenant_id` pe fiecare tabel de business).
- Frontend web: React (SPA), consumă exclusiv API-ul propriu. UI kit:
  **Metronic** (pachet React, Metronic 9, Tailwind/KTUI) — sursele stau în
  `/web` la rădăcina repo-ului, ca folder soră cu `/api`. Licență
  cumpărată acum: **Regular ($49), doar pentru dezvoltare** — interzisă
  pentru un produs pe care taxezi clienți reali. Obligatoriu upgrade la
  licența **Extended** înainte de lansare comercială/primul client
  plătitor (vezi `docs/architecture.md`, secțiunea „Metronic — UI kit").
- Mobil: PWA întâi; Flutter/React Native doar dacă se cere explicit prezență
  în app store — nu construi două aplicații native separat.
- Hosting: Hetzner Cloud (UE), Docker Compose, Caddy (reverse proxy +
  TLS automat). NU Hostinger, NU AWS Lambda pentru MVP. Runbook complet:
  `docs/deploy.md`.
- Plăți: Stripe (card internațional) + Netopia (RON local).
- Email: Resend. Storage fișiere: Cloudflare R2. Conectivitate externă:
  webhooks + n8n self-hosted (nu construi integrări individuale per client).
- CI/CD: GitHub Actions.
- AI: model cu vedere (Anthropic Claude API, implicit) prin adaptor izolat
  `src/integrations/ai` — vezi regula #7 și `docs/architecture.md`,
  secțiunea „Add-on AI".
- Analitice comportamentale (timp în aplicație, interval orar) pentru
  panelul admin intern: PostHog self-hosted pe Hetzner — nu construit de
  la zero. Vezi `docs/platform-admin-spec.md`.

Motivația completă a fiecărei alegeri: `docs/architecture.md`.

## Reguli de arhitectură (obligatorii, nu opționale)

1. Tot ce expune UI trece prin API propriu documentat (OpenAPI) — niciodată
   logică de business direct în frontend.
2. Fiecare modul de business = pachet izolat (`src/modules/<nume>`), graniță
   de cod clară; comunică cu alte module doar prin interfețe/servicii
   publice, niciodată import direct de fișiere interne ale altui modul.
3. Accesul la un modul plătit se verifică **doar** prin `ModuleGuard` la
   backend — niciodată doar ascuns în UI. Vezi tiparul exact în
   `docs/data-model.md`.
4. Activarea/dezactivarea unui entitlement se face **exclusiv** din
   handler-ul de webhook de plată (Stripe/Netopia), niciodată dintr-un
   endpoint apelabil direct de client.
5. Orice interacțiune cu ANAF (e-Factura, SAF-T, e-TVA, SPV) trece printr-un
   adapter izolat (`src/integrations/anaf`) — formatele XML se schimbă
   anual, nu le hardcoda în modulele de business.
6. Orice query pe un tabel de business filtrează explicit după `tenant_id`
   — fără excepție, inclusiv în teste și job-uri programate.
7. Orice interacțiune cu un model AI (OCR, extragere date, chat) trece
   printr-un adaptor izolat (`src/integrations/ai`) — modelul/providerul se
   schimbă des din motive tehnologice, nu-l hardcoda în module de business.
   Fiecare apel se contorizează în `usage_events` (cost marginal real, spre
   deosebire de restul stack-ului) — niciun apel AI necontorizat.
8. Panelul admin intern (`src/modules/platform-admin`) e singura excepție
   de la regula #6 — accesul lui se verifică exclusiv prin
   `PlatformAdminGuard` + tabela `platform_admins` (fără `tenant_id`),
   niciodată prin `ModuleGuard`. Nu există niciun tenant/plan sub care un
   client să vadă acest panel. Detaliu: `docs/platform-admin-spec.md`.

## Schema de date esențială

Detaliu complet (DDL executabil, migrări Prisma reale): `docs/data-model.md`.
Tabele centrale: `tenants`, `modules`, `plans`, `tenant_modules`,
`usage_events`, `users` (autentificare — implementat, vezi
`docs/data-model.md`, secțiunea „Autentificare (JWT)").

Schema specifică fiecărui modul de business stă în propriul fișier de
specificație, nu aici — pentru Modulul 1: `docs/invoicing-spec.md`, aliniată
cu structura oficială SAF-T D406 din `docs/saft/` (documentele ANAF
originale) și `docs/saft-mapping.md` (distilarea câmp-cu-câmp); pentru
Portalul Clienți: `docs/customer-portal-spec.md` (identitate `portal_users`
separată de `users`/`platform_admins`, izolare pe `portal_user_links`
verificate); pentru Panelul Admin Intern: `docs/platform-admin-spec.md`
(`platform_admins` — staff Mittani fără `tenant_id`, `payments` — jurnal
Stripe/Netopia, extensie RBAC pe `users` existent); pentru add-on-ul AI:
`docs/ai-addon-spec.md` (`purchase_documents` — draft OCR, niciodată
auto-confirmat).
Orice tabel nou de business care ține de facturi, clienți sau produse
trebuie verificat contra `docs/saft/` înainte de a fi creat — regulă
detaliată în `docs/roadmap.md`, secțiunea „Structura de date".

## Ordinea de construcție a modulelor

Nu sări peste ordine fără o decizie explicită și documentată în
`docs/roadmap.md`:

1. Facturare + e-Factura ANAF (obligatoriu legal — se vinde singur, imediat)
   — **add-on AI** (OCR facturi/bonuri de achiziție) se construiește imediat
   alături, ca extensie peste Modulul 1, nu ca modul propriu numerotat;
   dublu rol: funcție folosită în produs + cârlig public de achiziție
   clienți (demo fără cont). Motivație: `docs/architecture.md`, secțiunea
   „Add-on AI"; pricing: `docs/pricing.md`; specificație completă (schema
   `purchase_documents`, flux review, demo): `docs/ai-addon-spec.md`. —
   **Portal Clienți** se construiește tot alături: la fiecare factură
   emisă, clientul primește o notificare să se conecteze într-un portal
   unde vede facturile și plățile lui — motor de creștere a bazei de
   utilizatori. Identitate unică pe platformă (nu per tenant), acces mereu
   gratuit pentru portal user. Detaliu complet: `docs/customer-portal-spec.md`.
   — **Panel Admin Intern** (doar Mittani Solutions, invizibil pentru
   clienți) se construiește tot din faza asta, de îndată ce există încasări
   reale de urmărit — plan/încasări/consum per client + agregate (MRR,
   churn). Acces exclusiv prin `PlatformAdminGuard` (regula #8), niciodată
   prin `ModuleGuard`. Detaliu complet: `docs/platform-admin-spec.md`.
2. Stocuri + clienți/furnizori
3. Contabilitate primară + SAF-T (consumă mapările de cont — `tax_codes.
   vat_account_output`/`vat_account_input`, `products.revenue_account` —
   deja pregătite de Modulul 1, vezi `docs/invoicing-spec.md`)
4. CRM simplu
5+. HR/salarizare, producție, POS, integrări bancare — **doar** la cerere
    confirmată de clienți reali, nu speculativ

## Pricing (referință — nu recalcula de la zero)

Axă principală: număr de firme. Axă secundară: număr de utilizatori.
Module de bază incluse din pachetul Start; module avansate = add-on separat
de la Business în sus. Excepție intenționată: add-on-ul AI se taxează pe uz
(scanări/lună + exces), contorizat prin `usage_events` — nu o a treia axă
generală. Detaliu și cifre: `docs/pricing.md`.

## Convenții de cod

- TypeScript strict; niciun `any` fără comentariu care justifică de ce.
- Un guard/decorator/tabel nou din nucleu (auth, entitlements, billing) se
  documentează imediat în `docs/data-model.md`, nu doar în cod. Un tabel
  nou dintr-un modul de business (facturare, stocuri...) se documentează în
  fișierul de specificație propriu al acelui modul (ex. Modulul 1 →
  `docs/invoicing-spec.md`), nu în `docs/data-model.md` — vezi „Schema de
  date esențială" mai jos. În ambele cazuri: niciodată doar în cod —
  următoarea sesiune trebuie să-l găsească fără să citească tot codul sursă.
- Migrări DB: o migrare per schimbare de schemă, via `prisma migrate dev`;
  niciodată editarea retroactivă a unei migrări deja aplicate în producție.
- Mesaje de commit: `<modul>: <ce s-a schimbat>` (ex: `invoicing: adaugă
  validare CUI la emitere factură`).

## Verificare obligatorie înainte de a marca un task „gata”

Modelul e pe două nivele: un agent de domeniu per modul (verifică regulile
specifice ale acelui modul) + trei agenți de sistem (arhitectură generală,
logică/securitate, igienă documentară) + un orchestrator care corelează
tot la final. Pașii:

1. Rulează **în paralel**, într-un singur mesaj: `plan-guardian`,
   `logic-reviewer`, `docs-sync`, și agentul (sau agenții) de domeniu ai
   modulului/modulelor pe care ai lucrat — ex. `invoicing-guardian` pentru
   `src/modules/invoicing`, `customer-portal-guardian` pentru
   `src/modules/customer-portal`, `platform-admin-guardian` pentru
   `src/modules/platform-admin`, `ai-addon-guardian` pentru
   `src/modules/ai-addon`, `rbac-guardian` pentru `src/rbac`/`src/users`
   (nucleu, nu modul de business, dar cu agent dedicat — un audit holistic
   anterior a găsit un BLOCANT de securitate pe care niciun agent general nu
   l-a prins izolat, vezi `.claude/agents/rbac-guardian.md`). Dacă o
   schimbare atinge mai multe module deodată (ex. un câmp din invoicing
   consumat și de portal), rulează toți agenții de domeniu relevanți în
   același pas, nu doar unul. Dacă modulul nu are încă un agent dedicat,
   creează unul nou după tiparul din `.claude/agents/invoicing-guardian.md`
   (schimbă doar regulile de domeniu, păstrează structura) înainte să
   continui.
2. Corectează orice BLOCANT raportat de oricare dintre ei; re-rulează doar
   agentul relevant pe partea corectată. `docs-sync` nu raportează
   niciodată BLOCANT (nu e risc legal/fiscal direct) — dar corectează
   IMPORTANT-urile lui la fel de serios: o documentație desincronizată
   induce în eroare exact sesiunea viitoare care se bazează pe ea.
3. Abia după ce toți agenții rulați raportează fără blocante, invocă
   `system-orchestrator`, cu rapoartele complete ale tuturor agenților
   incluse în promptul de apel (el nu le poate citi singur din context —
   trebuie i le pasezi explicit). Rolul lui e să găsească ce scapă unei
   verificări izolate pe un singur modul: contracte de dependență rupte
   între module, convenții inconsistente, module fără agent de verificare.
4. Nu marca task-ul complet până `system-orchestrator` nu răspunde
   `ARMONIZAT` sau până conflictele semnalate de el nu sunt rezolvate.

Nu rula `system-orchestrator` de unul singur, fără rapoartele celorlalți —
nu are cum să corelize ce nu i s-a arătat.

## Ce să NU faci (evită risipă de tokeni și de timp)

- Nu re-explora tot repo-ul pentru decizii deja fixate aici — citește direct
  fișierul relevant din `docs/`.
- Nu propune low-code/no-code, microservicii, sau alt provider de hosting
  fără cerere explicită din partea utilizatorului.
- Nu re-genera schema de date de la zero — extinde `docs/data-model.md`
  (și migrările Prisma reale din `prisma/`), nu doar SQL-ul conceptual.
- Nu rescrie sau duplica adaptorul ANAF în interiorul altui modul.
- Nu construi module din faza 5+ înainte ca 1-4 să fie stabile și vândute.
- Nu folosi o cotă TVA hardcodată sau ca valoare curentă fixă — `tax_codes`
  ține un istoric (`valid_from`/`valid_to`); actuale sunt 21%/11%/0% (din
  august 2025), cele vechi (19%/9%/5%) rămân în DB ca istoric, nu se șterg,
  dar nu pot fi active pentru un document nou. Detaliu: `docs/invoicing-spec.md`.
- Nu edita o factură cu status `issued` sau ulterior — orice corecție e o
  notă de credit nouă, legată de factura originală.
- Nu trata transmiterea e-Factura ca opțională sau ca acțiune manuală
  separată — e obligatorie prin lege pentru aproape orice factură emisă de
  Modulul 1 (B2B din 2024, B2C din 2025) și trebuie declanșată automat la
  emitere. Detaliu: `docs/invoicing-spec.md`, secțiunea „e-Factura ANAF".
- Nu duplica un produs ca să-i schimbi cota TVA — cota stă separat, în
  `tax_codes` (istoric) + `products.default_tax_type` (categorie); un
  `product_code` duplicat rupe identificatorul stabil de care depinde
  Modulul 2 și explodează catalogul la fiecare schimbare de lege.
- Nu lansa comercial (primul client care plătește) cu licența Metronic
  Regular — e cumpărată explicit doar pentru dezvoltare. Upgrade la
  Extended e o condiție de go-live, nu opțională.
- Nu oferi demo-ul public AI (OCR) fără limită și fără rate-limiting per
  IP/sesiune — apelurile au cost marginal real; fără plafon, cârligul de
  achiziție clienți devine risc financiar.
- Nu accepta `tenant_id`/`customer_id` direct din input pe nicio rută a
  Portalului Clienți — accesul unui portal user se rezolvă exclusiv din
  `portal_user_links` verificate, legate de sesiunea lui. E o breșă IDOR,
  nu o simplă omisiune de stil.
- Nu taxa niciodată un portal user pentru accesul la propriile facturi —
  gratuit e condiția care face din portal un motor de creștere, nu doar
  altă funcționalitate.
- Nu expune nicio rută a Panelului Admin Intern prin `ModuleGuard` sau ca
  opțiune activabilă în `tenant_modules` — accesul se verifică exclusiv
  prin `PlatformAdminGuard` + `platform_admins`. Niciun tenant/plan nu
  trebuie să poată vedea vreodată acest panel.
- Nu scrie în `payments` din altă parte decât handler-ul de webhook
  Stripe/Netopia — la fel ca `tenant_modules` (regula #4), e sursa de
  adevăr pentru încasări, nu un tabel editabil din panelul admin.
