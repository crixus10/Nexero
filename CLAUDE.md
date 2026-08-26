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
- Frontend web: React (SPA), consumă exclusiv API-ul propriu.
- Mobil: PWA întâi; Flutter/React Native doar dacă se cere explicit prezență
  în app store — nu construi două aplicații native separat.
- Hosting: Hetzner Cloud (UE), Docker Compose. NU Hostinger, NU AWS Lambda
  pentru MVP.
- Plăți: Stripe (card internațional) + Netopia (RON local).
- Email: Resend. Storage fișiere: Cloudflare R2. Conectivitate externă:
  webhooks + n8n self-hosted (nu construi integrări individuale per client).
- CI/CD: GitHub Actions.

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

## Schema de date esențială

Detaliu complet (DDL): `docs/data-model.md`. Tabele centrale:
`tenants`, `modules`, `plans`, `tenant_modules`, `usage_events`.

## Ordinea de construcție a modulelor

Nu sări peste ordine fără o decizie explicită și documentată în
`docs/roadmap.md`:

1. Facturare + e-Factura ANAF (obligatoriu legal — se vinde singur, imediat)
2. Stocuri + clienți/furnizori
3. Contabilitate primară + SAF-T
4. CRM simplu
5+. HR/salarizare, producție, POS, integrări bancare — **doar** la cerere
    confirmată de clienți reali, nu speculativ

## Pricing (referință — nu recalcula de la zero)

Axă principală: număr de firme. Axă secundară: număr de utilizatori.
Module de bază incluse din pachetul Start; module avansate = add-on separat
de la Business în sus. Detaliu și cifre: `docs/pricing.md`.

## Convenții de cod

- TypeScript strict; niciun `any` fără comentariu care justifică de ce.
- Un guard/decorator/tabel nou se documentează imediat în
  `docs/data-model.md`, nu doar în cod — următoarea sesiune trebuie să-l
  găsească fără să citească tot codul sursă.
- Migrări DB: o migrare per schimbare de schemă; niciodată editarea
  retroactivă a unei migrări deja aplicate în producție.
- Mesaje de commit: `<modul>: <ce s-a schimbat>` (ex: `invoicing: adaugă
  validare CUI la emitere factură`).

## Verificare obligatorie înainte de a marca un task „gata”

După orice modul/feature nou sau modificare de logică de business, rulează
**în paralel** (într-un singur mesaj, două apeluri de agent):

- `plan-guardian` — verifică respectarea arhitecturii/roadmap-ului de mai sus
- `logic-reviewer` — verifică erori de logică, securitate, cazuri limită

Nu marca task-ul complet până niciunul dintre cei doi nu raportează blocante.
Dacă un agent raportează o încălcare, corecteaz-o și rulează-l din nou doar
pe partea corectată — nu re-rula tot ce a fost deja validat.

## Ce să NU faci (evită risipă de tokeni și de timp)

- Nu re-explora tot repo-ul pentru decizii deja fixate aici — citește direct
  fișierul relevant din `docs/`.
- Nu propune low-code/no-code, microservicii, sau alt provider de hosting
  fără cerere explicită din partea utilizatorului.
- Nu re-genera schema de date de la zero — extinde `docs/data-model.md`.
- Nu rescrie sau duplica adaptorul ANAF în interiorul altui modul.
- Nu construi module din faza 5+ înainte ca 1-4 să fie stabile și vândute.
