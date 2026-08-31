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

## De ce Caddy, nu nginx/Traefik

TLS automat (Let's Encrypt) fără configurare manuală de certificate —
config de câteva linii (un `Caddyfile`) vs. fișiere separate nginx +
certbot + cron de reînnoire. Un singur binar, fără dependențe. Se
potrivește principiului „cost mic, control total" — nu diferențiază
produsul, deci nu merită complexitate suplimentară. Decizie confirmată,
nu doar recomandare — runbook complet în `docs/deploy.md`.

## Metronic — UI kit pentru frontend

Nu e un framework, nu dictează nimic despre backend — e strict un kit de
componente UI (layout, meniuri, tabele de date cu sortare/filtrare/acțiuni
în masă, formulare, ecrane de autentificare, stepper-e), pe care îl folosim
ca strat de prezentare peste API-ul NestJS propriu. Nu schimbă nicio regulă
de arhitectură de mai sus — tot ce e logică de business rămâne în backend,
Metronic doar desenează. Alegem pachetul **React** din Metronic 9 (Tailwind
CSS + componente KTUI/ReUI) — generația curentă, activ întreținută —, nu
varianta HTML/Vue/Angular/Next.js din același bundle.

**Licență**: cumpărată acum licența **Regular ($49)** — validă doar pentru
dezvoltare, interzisă explicit pentru un produs pe care încasezi clienți
reali. Înainte de primul client plătitor, upgrade obligatoriu la licența
**Extended** (~$969-999) — aceea acoperă corect un singur produs SaaS,
oricâți utilizatori plătitori, oricâte subdomenii/instanțe de server, atâta
timp cât rămâne același produs. Nu e nevoie de o licență per instanță sau
per client.

**Unde stau sursele**: Metronic se descarcă drept un bundle mare, cu toate
variantele de framework (HTML, React, Vue, Angular, Next.js) și toate
integrările backend (Laravel, Django, ASP.NET...) în același arhivă. Din
el se extrage **doar pachetul React** (varianta Tailwind, Metronic 9) —
restul variantelor nu se aduc în repo, ca să nu umple proiectul cu cod pe
care nicio sesiune Claude Code nu are motiv să-l exploreze vreodată.

```
repo/
├── api/          ← backend NestJS (schelet conform Faza 1 din planul de pornire)
├── web/          ← frontend React — aici intră pachetul React din Metronic
│   ├── src/
│   │   ├── components/   ← componentele Metronic (layout, tabele, formulare)
│   │   ├── pages/        ← paginile proprii, per modul, construite pe măsură
│   │   └── ...
│   └── package.json
├── docs/
├── .claude/
└── CLAUDE.md
```

Pași după cumpărare:

1. Descarcă arhiva de pe ThemeForest (sau din contul KeenThemes, dacă
   licența s-a activat acolo).
2. Extrage **doar folderul pachetului React** (Tailwind, Metronic 9) —
   ignoră HTML/Vue/Angular/Next.js și orice integrare backend din arhivă.
3. Copiază conținutul lui în `web/` la rădăcina repo-ului, ca folder soră
   cu `api/`.
4. Șterge paginile demo pe care nu le folosești (ex. e-commerce store,
   CRM demo, exemple de chat/kanban) — păstrează doar layout-ul de bază
   (sidebar, header, autentificare) și componentele generice (tabele,
   formulare); paginile reale pentru fiecare modul se construiesc pe
   măsură ce modulul respectiv se construiește, nu toate din prima.
5. Nu comite în git dovada de cumpărare (factură, cod de licență) — ține-o
   în contul tău ThemeForest/KeenThemes sau local, în afara repo-ului
   (`.gitignore` dacă păstrezi vreun fișier de genul acesta lângă cod).
6. Notează-ți undeva (calendar, task tracker) upgrade-ul de licență ca pas
   obligatoriu înainte de lansarea comercială — nu ceva de uitat la capătul
   proiectului.

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

## Add-on AI — OCR facturi/bonuri, dublu rol: funcție + cârlig

Nu e „Modulul 5", tratat separat și speculativ ca restul modulelor din
faza 5+ — e o extensie construită imediat alături de Modulul 1, pentru că
are un caz de folosire validat de la lansare, nu unul ipotetic.

**Ce face**: utilizatorul încarcă o poză/PDF cu o factură sau un bon primit
de la un furnizor; sistemul extrage automat CUI, sumă, TVA, linii de
produse și pre-completează un document draft, în loc de introducere
manuală. Rezolvă o durere reală (achiziția e cel mai plictisitor punct de
introducere de date la un IMM) și se leagă direct de schema deja construită
pentru Modulul 1 (aliniată SAF-T) — cost de integrare mic.

**De ce e și cârlig de achiziție clienți**: aceeași funcție, expusă public
pe site, fără cont — „încarcă o factură/bon și vezi extragerea automată",
cu o limită de încercări gratuite. Cine încearcă vede valoarea produsului
în 10 secunde, pe propriile lui documente, nu pe un exemplu din
prezentare — conversie la trial/cont mult mai eficientă decât o pagină de
vânzări clasică (product-led growth, nu outbound).

**De ce adaptor izolat** (`src/integrations/ai`, regula #7 din
`CLAUDE.md`): motivul e diferit de adaptorul ANAF (acolo, formatul se
schimbă anual, impus de stat), dar rezultatul e identic — providerul de AI
și modelul folosit se schimbă des din motive tehnologice/de cost, iar dacă
logica de apelare e împrăștiată prin module, o schimbare de provider
înseamnă rescriere pe mai multe fișiere. Izolat, schimbarea se face
într-un singur loc. Implicit: un model Anthropic Claude cu capacitate de
vedere (vision) — swappable, nu hardcodat.

**De ce se taxează pe uz, nu în abonamentul plat**: spre deosebire de
restul stack-ului (Hetzner, Resend, R2 — cost aproape fix, insensibil la
volum), fiecare apel către un model AI are cost marginal real. Se
contorizează prin `usage_events` (tabelă deja existentă în nucleul de
entitlements, `docs/data-model.md`) — un pachet de scanări incluse per
plan, cu taxare pe exces. Asta nu contrazice regula „nicio a treia axă de
facturare" din `docs/pricing.md` — aceea vizează structura de bază a
planurilor (firme × utilizatori); metering-ul pe uz se aplică punctual,
doar la funcționalitățile cu cost marginal real (AI, eventual SMS), nu la
tot produsul.

**Limită obligatorie pe demo-ul public**: fără cont, fără plată — deci fără
control natural asupra volumului. Rate-limiting per IP/sesiune (ex. 3
scanări/zi) e o condiție de lansare, nu un detaliu de implementare ulterior
— altfel cârligul de achiziție clienți devine o gaură de cost deschisă
public.

**Ce NU e inclus în decizia asta**: schema de date, fluxul exact de review
și planul de implementare pas-cu-pas sunt în `docs/ai-addon-spec.md`.

## Portal Clienți — de ce identitate globală, nu per tenant

Detaliul complet e în `docs/customer-portal-spec.md` — aici doar
motivația, ca să nu se redeschidă dezbaterea. Un `portal_user` (persoana
care primește facturi) e o identitate unică pe toată platforma, nu
recreată per tenant, pentru că scopul explicit e efectul de rețea: cu cât
mai mulți tenanți emit facturi prin platformă, cu atât mai valoros devine
un cont de portal (agregă tot într-un loc), și cu atât mai mulți
destinatari — firme, la rândul lor — devin lead-uri calificate pentru un
cont de tenant nou. O identitate fragmentată per tenant ar anula exact
efectul ăsta.

Contrapartida: identitatea globală, dar acces strict izolat pe legături
verificate explicit (`portal_user_links`), niciodată pe `tenant_id` primit
ca input — o breșă aici ar însemna un client care vede facturile altui
client, nu doar date interne ale unui singur tenant. E motivul pentru care
Portalul are propriul agent de verificare (`customer-portal-guardian`),
nu doar regulile generale de `tenant_id` din restul platformei.

## Panel Admin Intern — de ce separat de orice altă noțiune de „acces"

Detaliul complet e în `docs/platform-admin-spec.md` — aici doar motivația.
Tot restul platformei se organizează în jurul unei singure întrebări: „ce
modul are activ acest tenant?" (`ModuleGuard`, `tenant_modules`). Panelul
admin răspunde la o întrebare complet diferită — „cine din Mittani
Solutions are voie să vadă date despre toți clienții?" — și de asta nu
reutilizează niciun mecanism existent: nu e un „modul" cu billing_type,
nu apare în `tenant_modules`, nu trece prin `ModuleGuard`. Are propriul
guard (`PlatformAdminGuard`), propriul tabel fără `tenant_id`
(`platform_admins`) și, recomandat, propriul deploy de frontend pe
subdomeniu separat — nu o rută ascunsă în aceeași aplicație pe care o
folosesc clienții.

Motivul separării stricte: o breșă la Portalul Clienți expune facturile
unui client altui client (grav, dar limitat la doi tenanți). O breșă la
panelul admin ar expune datele **tuturor** clienților simultan — încasări,
consum, contacte — către oricine ajunge la acel panel. E motivul pentru
care are propriul agent de verificare (`platform-admin-guardian`), separat
de `customer-portal-guardian`, cu regula de acces ca unic punct BLOCANT
prioritar.

## Cost de infrastructură (ordin de mărime, orientativ)

- Pornire (sub 100 firme client): ≈ 11-15 €/lună (1 VPS Hetzner CX33,
  restul pe tier gratuit).
- Scalare (câteva sute de clienți activi): ≈ 75-100 €/lună.
- Costul crește mult mai lent decât veniturile — vezi `docs/pricing.md`
  pentru motorul economic din spate.
