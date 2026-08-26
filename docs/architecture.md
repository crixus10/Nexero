# Arhitectură — motivația deciziilor

Citit la nevoie, nu automat. Rezumă *de ce* stack-ul din CLAUDE.md e fixat
așa, ca să nu se redeschidă dezbaterea la fiecare sesiune nouă.

## Principiu

Control total pe cod și platformă, cost mic pentru tot ce nu diferențiază
produsul. Reguli: nu construi ce poți cumpăra ieftin (email, plăți, storage,
SMS); nu cumpăra/nu externaliza ce trebuie să controlezi (logica de
business, baza de date, entitlements, auth).

## De ce monolit modular, nu microservicii

Cost operațional (orchestrare, observability, rețea internă) nu se
justifică sub 10-15 dezvoltatori și încetinește viteza de iterație exact
când ai mai multă nevoie de ea. Un monolit pe module bine izolate se
descompune ulterior în servicii separate fără rescriere de logică, dacă și
când chiar e nevoie.

## De ce PostgreSQL + schemă multi-tenant comună

Portabil pe orice provider (fără lock-in), gratuit, robust. Schemă comună
cu `tenant_id` e cel mai ieftin de operat la scară IMM; schemă separată per
tenant rămâne opțiune doar pentru clienți enterprise care cer izolare
completă — nu implicit.

## De ce API-first + PWA înainte de nativ

Tot ce face UI-ul trece prin API propriu → „mobile ready” aproape gratis:
PWA peste frontend-ul web existent acoperă majoritatea nevoilor unui mini
ERP la cost aproape zero. Flutter/React Native (peste același API, nu
logică duplicată) doar dacă cererea de prezență în App Store/Play Store e
confirmată, nu presupusă.

## De ce Hetzner, nu Hostinger/AWS Lambda

Hostinger: preț afișat e promoțional (lock-in 2-4 ani), la reînnoire crește
20-40%; brand orientat spre hosting de site-uri, nu infra de producție.
AWS Lambda: complexitate operațională nejustificată la scara unui MVP.
Hetzner: preț lunar transparent, fără lock-in, datacentere UE (GDPR),
tooling matur pentru automatizare (API, Terraform).

## De ce webhooks + n8n, nu integrări construite una câte una

O integrare per client cerut nu scalează. Evenimentele de business
(factură emisă, plată încasată, stoc sub prag) se publică o singură dată ca
webhook; clientul își conectează n8n (self-hosted, gratuit) sau
Zapier/Make. Cost de dezvoltare fix, indiferent de câte integrări cer
clienții.

## De ce adapter ANAF izolat

Formatele XML (e-Factura, SAF-T, e-TVA) se schimbă practic anual, impuse de
stat, nu de noi. Dacă logica de conformitate e împrăștiată prin modulele de
business, fiecare schimbare de format înseamnă rescriere pe mai multe
fișiere. Izolat într-un singur adapter, schimbarea se face într-un loc.

## Cost de infrastructură (ordin de mărime, orientativ)

- Pornire (sub 100 firme client): ≈ 11-15 €/lună (1 VPS Hetzner CX33,
  restul pe tier gratuit).
- Scalare (câteva sute de clienți activi): ≈ 75-100 €/lună.
- Costul crește mult mai lent decât veniturile — vezi `docs/pricing.md`
  pentru motorul economic din spate.
