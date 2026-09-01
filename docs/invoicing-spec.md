# Modulul 1 — Facturare: specificație funcțională

Referință completă pentru tot ce ține de modulul de facturare. Citit de
`invoicing-guardian` la fiecare verificare și de orice sesiune care lucrează
pe acest modul. Nu duplica aceste decizii în cod-comentarii lungi — trimite
aici.

## Reper de piață

Funcționalitatea de bază e calibrată după trei repere: **Xero/Sage**
(facturare simplă, online, orientată spre IMM — quotes, facturi recurente,
note de credit, plată online, remindere automate) și **SAP Business One**
(lanț de documente legate: Ofertă → Comandă → Livrare → Factură → Notă de
credit, cu trasabilitate completă între ele). Nu construim complexitatea
completă SAP B1 de la Modulul 1 (Livrare ține de modulul Stocuri, #2), dar
proiectăm schema ca lanțul de documente să poată fi legat mai târziu fără
restructurare.

## Tipuri de documente (Modulul 1)

| Tip | Scop | Serie proprie |
|---|---|---|
| Proformă / Ofertă | document informativ, fără efect fiscal | da |
| Factură | document fiscal standard | da |
| Factură de avans | pentru plăți în avans, conform regulilor RO de TVA | da |
| Notă de credit (stornare) | anulează/corectează o factură emisă, leagă la factura originală | da |
| Factură recurentă | șablon care generează automat facturi la interval fix | — (generează pe seria „Factură") |

O factură **emisă (issued) nu se editează niciodată** — orice corecție se
face printr-o notă de credit nouă, legată de factura originală
(`reversed_invoice_id`). Asta ține integritatea seriei de numerotare
intactă, cerință legală (Codul fiscal) și cerință SAF-T deopotrivă.

**Plafon obligatoriu**: suma cumulată a tuturor notelor de credit legate de
un original (`Σ invoice_amount` unde `reversed_invoice_id` = originalul) nu
poate depăși `invoice_amount` al originalului — corecțiile parțiale sunt
permise (mai multe note de credit mici pe același original), dar suma lor
totală nu poate „storna mai mult decât s-a facturat". Verificat la creare,
în aceeași tranzacție care inserează nota nouă (nu separat, ca să nu existe
o fereastră de cursă între două cereri concurente de storno pe același
original).

## Numerotare — regulă obligatorie

Fiecare serie (`invoice_series`) alocă numere secvențial, **fără goluri**,
per tenant. Alocarea numărului se face atomic (o singură tranzacție DB care
incrementează `next_number` și creează factura), niciodată calculat din
`MAX(invoice_no)` — o cursă între două request-uri concurente ar produce
fie un gol, fie un duplicat, ambele inacceptabile legal.

## Cote TVA — istoric, nu doar valoarea curentă

De la 1 august 2025 (Legea 141/2025): **21%** standard, **11%** redusă
(unificată — a înlocuit 9% și 5%), **0%** scutit/export/intracomunitar.
Înainte de acea dată au existat concurent **19%** standard, **9%** redusă
(alimente, medicamente, cărți...) și **5%** redusă (construcții, locuințe
sociale, unele servicii turistice) — două cote reduse diferite, active în
același timp, nu o singură cotă care s-a schimbat.

Pentru că un document poate fi emis retroactiv verificat, corectat printr-o
notă de credit legată de un original vechi, sau raportat SAF-T pentru o
perioadă din trecut, sistemul **nu ține doar cota curentă** — ține un
istoric complet, cu perioadă de valabilitate per cotă (tabela `tax_codes`
de mai jos, cu `valid_from`/`valid_to`). Rândurile vechi (19%/9%/5%) rămân
în DB permanent, ca istoric — nu se șterg niciodată. Ce e interzis e
folosirea lor ca implicite sau alegerea lor pentru un document nou emis
după 1 august 2025 (verificat de `invoicing-guardian`).

Vezi `docs/saft-mapping.md` pentru codurile SAF-T asociate (S21, R11, E,
plus istoricele S19, R9, R5).

## Schema de date (aliniată SAF-T — vezi docs/saft-mapping.md)

**Notă (2026-09-01):** tabelul de mai jos s-a numit inițial `customers`
(`customer_code`) — redenumit **`companies`** (`company_code`) la mutarea
nomenclatorului de clienți în Modulul 4 (CRM), fără nicio schimbare de
câmpuri (migrare RENAME, nu DROP+CREATE — vezi `docs/crm-spec.md`, „De ce
Company înlocuiește Customer”). CRUD-ul lui stă azi în
`src/modules/crm/companies/`, nu în `src/modules/invoicing/`.

```sql
-- Date master minime — vezi „Dependență cu modulul Stocuri” mai jos
CREATE TABLE companies (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id),
  company_code        TEXT NOT NULL,        -- CustomerID (SAF-T)
  tax_id              TEXT,                 -- CustomerTaxID: CUI/CNP (SAF-T)
  name                TEXT NOT NULL,        -- CompanyName (SAF-T)
  address             TEXT,
  postal_code         TEXT,
  city                TEXT,
  country             TEXT NOT NULL DEFAULT 'RO',
  is_vat_payer        BOOLEAN NOT NULL DEFAULT true,
  preferred_language  TEXT NOT NULL DEFAULT 'ro',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, company_code)
  -- + câmpuri CRM (website, email, phone, description, categories,
  -- connectionStrength, estimatedRevenueRange) — vezi docs/crm-spec.md,
  -- nu duplicate aici.
);

CREATE TABLE products (              -- stub minimal, vezi nota de dependență
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id),
  product_code        TEXT NOT NULL,        -- ProductCode (SAF-T)
  description         TEXT NOT NULL,        -- ProductDescription (SAF-T)
  unit_of_measure     TEXT NOT NULL,        -- UnitOfMeasure (SAF-T)
  default_tax_type    TEXT NOT NULL CHECK (default_tax_type IN
                         ('Standard','Reduced','Exempt')),  -- categorie, nu cotă înghețată
  unit_price          NUMERIC(14,2),
  revenue_account     TEXT NOT NULL DEFAULT '707',  -- cont contabil de venituri
                                                      -- (707 mărfuri / 704 servicii / 701
                                                      -- produse finite...) — pregătire Modulul 3
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, product_code)
);

CREATE TABLE tax_codes (              -- TaxTable (SAF-T) — istoric complet de cote
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tax_code            TEXT NOT NULL,          -- cod SAF-T: S21, R11, E, S19, R9, R5...
  tax_type            TEXT NOT NULL,          -- Standard | Reduced | Exempt
  tax_percentage      NUMERIC(5,2) NOT NULL,  -- 21.00 | 11.00 | 0.00 | 19.00 | 9.00 | 5.00
  valid_from          DATE NOT NULL,
  valid_to            DATE,                    -- NULL = cotă activă acum
  is_default          BOOLEAN NOT NULL DEFAULT false,  -- propusă implicit în UI, per tax_type
  vat_account_output  TEXT,                    -- cont TVA colectată (ex. 4427) — vânzare;
                                                -- NULL unde nu se aplică (0%/scutit fără cont)
  vat_account_input   TEXT,                    -- cont TVA deductibilă (ex. 4426) — achiziție,
                                                -- relevant la modulul de achiziții/Contabilitate
  description         TEXT NOT NULL,
  UNIQUE (tax_code, valid_from),
  CHECK (valid_to IS NULL OR valid_to > valid_from)
);

CREATE TABLE invoice_series (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id),
  series_code         TEXT NOT NULL,         -- 'FACT', 'PROF', 'AVANS', 'STORNO'
  document_type       TEXT NOT NULL CHECK (document_type IN
                         ('invoice','proforma','credit_note','debit_note','down_payment')),
  next_number         INTEGER NOT NULL DEFAULT 1,
  UNIQUE (tenant_id, series_code)
);

CREATE TABLE invoices (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id),
  series_id             UUID NOT NULL REFERENCES invoice_series(id),
  invoice_no            TEXT NOT NULL,         -- InvoiceNo (SAF-T)
  invoice_date          DATE NOT NULL,         -- InvoiceDate (SAF-T)
  tax_point_date        DATE NOT NULL,         -- TaxPointDate (SAF-T)
  invoice_type          TEXT NOT NULL CHECK (invoice_type IN
                           ('Normal','CreditNote','DebitNote','DownPayment')),
  company_id            UUID NOT NULL REFERENCES companies(id),
  currency              TEXT NOT NULL DEFAULT 'RON',
  exchange_rate         NUMERIC(12,6) NOT NULL DEFAULT 1,  -- curs BNR la data facturii
  status                TEXT NOT NULL CHECK (status IN
                           ('draft','issued','sent','paid','partially_paid',
                            'overdue','canceled')),
  invoice_amount        NUMERIC(14,2) NOT NULL,  -- InvoiceAmount (SAF-T)
  reversed_invoice_id   UUID REFERENCES invoices(id),  -- pt. storno -> factura originală
                                                  -- ON DELETE RESTRICT (nu SetNull — trasabilitate
                                                  -- storno↔original obligatorie, vezi migrarea de hardening)
  e_invoice_id          TEXT,                    -- eInvoiceID (SAF-T) — id SPV
  e_invoice_status      TEXT,                    -- pending | validated | rejected | error
  created_by            UUID NOT NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, series_id, invoice_no),
  CHECK (reversed_invoice_id IS NULL OR reversed_invoice_id != id)  -- o factură
                                                  -- nu poate fi propriul ei storno
);

CREATE TABLE invoice_lines (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id        UUID NOT NULL REFERENCES invoices(id),
  line_number       INTEGER NOT NULL,          -- LineNumber (SAF-T)
  product_id        UUID REFERENCES products(id),
  description       TEXT NOT NULL,
  quantity          NUMERIC(14,3) NOT NULL,
  unit_of_measure   TEXT NOT NULL,
  unit_price        NUMERIC(14,4) NOT NULL,
  line_amount       NUMERIC(14,2) NOT NULL,    -- LineAmount (SAF-T)
  tax_code_id       UUID NOT NULL REFERENCES tax_codes(id),  -- TaxID (SAF-T) — rândul
                                                -- exact rezolvat la data facturii, înghețat
  tax_amount        NUMERIC(14,2) NOT NULL,    -- TaxAmount (SAF-T)
  UNIQUE (invoice_id, line_number)
);

CREATE TABLE invoice_audit_log (       -- traseul de audit, obligatoriu
  id                BIGSERIAL PRIMARY KEY,
  invoice_id        UUID NOT NULL REFERENCES invoices(id),
  action            TEXT NOT NULL,     -- created | issued | sent | paid | canceled
  performed_by      UUID NOT NULL,
  performed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  details           JSONB
);
```

## Rezolvarea cotei TVA la momentul facturării

`products.default_tax_type` ține doar categoria (Standard/Reduced/Exempt),
niciodată o cotă înghețată — un produs nu trebuie corectat manual când se
schimbă legea. La adăugarea unei linii de factură, aplicația caută rândul
din `tax_codes` valabil la `invoice_date`:

```sql
SELECT id, tax_code, tax_percentage FROM tax_codes
WHERE tax_type = :product_default_tax_type
  AND valid_from <= :invoice_date
  AND (valid_to IS NULL OR valid_to > :invoice_date)
ORDER BY is_default DESC, valid_from DESC
LIMIT 1;
```

Rândul găsit se scrie o singură dată în `invoice_lines.tax_code_id` — după
emitere, acel rând rămâne legat de linie pentru totdeauna (imutabilitate),
indiferent de ce se întâmplă ulterior cu cotele active.

Rândul rezolvat automat e doar **propunerea implicită** — utilizatorul care
emite (rol `invoicing:issuer`) poate alege manual alt rând valid din
`tax_codes` pentru acea linie, la nevoie: același produs poate ieși pe
factură cu cotă diferită în funcție de context (livrare intracomunitară
0%, promoție cu altă încadrare fiscală etc.), fără să însemne că produsul
în sine s-a schimbat. Asta acoperă corect cazul „același produs vândut cu
cote diferite" fără să dubleze fișa de produs — o singură categorie pe
produs, câte rânduri de cotă sunt nevoie în `tax_codes`, alese explicit pe
linie când contextul o cere.

**De ce nu duplicăm produsul la fiecare schimbare de cotă**: o schimbare de
lege (ca cea din august 2025) afectează simultan mii de produse ale
aceluiași tenant — dacă am muta cota pe produs, fiecare schimbare de lege
ar cere duplicarea în masă a catalogului, exact la data intrării în
vigoare, cu riscul ca șabloanele de facturare recurentă sau prețurile
existente să rămână legate de fișa veche. Mai grav, ar rupe contractul de
`product_code` stabil de care depinde Modulul 2 (vezi mai jos) — un
produs „duplicat" înseamnă un `product_code` nou, deci istoricul de
facturare al produsului original devine orfan. Ținând cota separată de
produs, o schimbare de lege înseamnă un singur rând nou în `tax_codes`,
nu N duplicate de produse.

**`tax_codes` e append-only** — la o schimbare de lege (ca cea din august
2025) se inserează rânduri noi cu `valid_from` de la data intrării în
vigoare și se închide rândul vechi setându-i `valid_to` (singura coloană a
unui rând existent care se poate modifica); nu se face niciodată `UPDATE`
pe `tax_percentage` a unui rând deja folosit de o factură.

**Limitări cunoscute, acceptate pentru acum** (semnalate de `logic-reviewer`,
nu blocante — nu există încă niciun cod care scrie în `tax_codes` în afara
seed-ului): schema nu are o constrângere DB (`EXCLUDE ... WITH &&`) care să
prevină două rânduri cu același `tax_code` și intervale de valabilitate
suprapuse, și nici un trigger care să blocheze un `UPDATE` retroactiv pe
`tax_percentage` — ambele se bazează exclusiv pe convenția de mai sus,
aplicată de serviciul `invoicing:admin` care încă nu există. De adăugat
(constrângere `EXCLUDE` cu extensia `btree_gist`, respectiv un trigger
`BEFORE UPDATE`) când se scrie acel serviciu, nu speculativ acum.

## Pregătire pentru modulul Contabilitate (#3) — contract de jurnalizare

Modulul 1 **nu generează note contabile, jurnal general, balanță de
verificare sau bilanț** — asta rămâne Modulul 3 (Contabilitate primară +
SAF-T, conform `docs/roadmap.md`). Dar schema de mai sus e proiectată ca
Modulul 3 să poată jurnaliza automat o factură emisă fără nicio
restructurare, mapând direct pe planul de conturi românesc (OMFP
1802/2014):

- `tax_codes.vat_account_output`/`vat_account_input` — contul TVA
  (colectată/deductibilă) e o proprietate a **cotei**, nu a facturii; toate
  cotele Standard din aceeași perioadă folosesc, de regulă, același cont
  (4427 la vânzare), indiferent de procent — de asta contul stă pe rândul
  din `tax_codes`, istorizat împreună cu cota, nu recalculat din procent.
- `products.revenue_account` — contul de venituri (707/704/701...) e o
  proprietate a **produsului**, independentă de cota TVA aplicată pe el.
- Clienții nu au nevoie de cont contabil propriu — toate facturile intră pe
  411 (Clienți) generic, cu analitic pe `company_code`, deja identificator
  stabil.

Nota contabilă pe care Modulul 3 o va genera la `status = issued` rezultă
direct din datele deja prezente pe factură, fără recalcul:

| Sens | Cont | Sumă |
|---|---|---|
| Debit | 411 Clienți (analitic `company_code`) | `invoice_amount` |
| Credit | `products.revenue_account`, grupat | Σ `line_amount` pe cont |
| Credit | `tax_codes.vat_account_output`, grupat | Σ `tax_amount` pe cont |

Suma creditelor egalează întotdeauna debitul, pentru că
`line_amount + tax_amount` compune deja `invoice_amount` (verificat la
emitere — vezi „Ciclul draft → issued"). O notă de credit generează
aceeași înregistrare, cu sensurile inversate, legată de nota originală
prin `reversed_invoice_id`.

Evenimentul de declanșare pentru Modulul 3 e aceeași tranziție
draft→issued care declanșează și transmiterea e-Factura — un singur punct
de intrare în ciclul de viață al facturii, nu două fluxuri separate care
pot ajunge desincronizate.

## Dependență cu modulul Stocuri (#2) — pentru harmonizer

`companies` (fost `customers` — redenumit la mutarea în Modulul 4/CRM,
vezi nota de mai sus) și `products` sunt **stub-uri minime**, suficiente
cât să funcționeze facturarea de sine stătător. Modulul Stocuri (#2) va
extinde `products` (stoc, depozite, rețete) și va adăuga `suppliers` — nu
va crea tabele noi paralele. Orice coloană adăugată acolo trebuie să
păstreze `product_code`/`company_code` ca identificator stabil, pentru că
`invoice_lines`/`invoices` deja le referențiază prin FK. Verificarea acestei
compatibilități e responsabilitatea `system-orchestrator` la fiecare rulare
combinată cu modulul 2.

**Aplicat, nu doar documentat** (Fază B.3): `UpdateCompanyDto`
(`src/modules/crm/companies/`) și `UpdateProductDto`
(`src/modules/invoicing/products/`) omit deliberat `companyCode`/
`productCode` — imposibil de redenumit prin API odată create, aplicat de
`ValidationPipe` global (`whitelist: true`, `src/main.ts`), nu doar o
convenție de urmat.

## Roluri multi-user (RBAC pe acest modul)

| Rol | Poate |
|---|---|
| `invoicing:viewer` | vede facturi, nu poate crea/edita/anula |
| `invoicing:issuer` | creează draft-uri, emite facturi |
| `invoicing:approver` | anulează/stornează facturi emise (separat de issuer — segregare a responsabilităților, cerință de audit) |
| `invoicing:admin` | gestionează serii de numerotare, cote TVA, setări modul |

Un utilizator cu doar `issuer` nu poate și storna propriile facturi — asta
previne o singură persoană să emită și să anuleze fără control, relevant la
un audit SAF-T/ANAF.

**Nomenclatoarele modulului** (produse, serii de facturare) — vezi
`ProductsController`/`InvoiceSeriesController` — urmează același RBAC, dar
segregat diferit față de facturi: citire — oricare din cele 4 roluri (un
nomenclator, nu un document fiscal, deci `viewer`/`approver` au acces
deplin de citire); creare/editare/ștergere produse — doar `issuer`+`admin`
(parte din fluxul curent de emitere, nu o acțiune de stornare);
creare/ștergere serii de numerotare —
doar `admin` (o serie configurată greșit se șterge și se recreează, nu se
editează — vezi `InvoiceSeriesService`, care omite deliberat `update()`).
Clienții (`CompaniesController`) au ieșit din acest RBAC — trăiesc azi în
modulul CRM, cu propriile roluri `crm:viewer/agent/admin`, vezi
`docs/crm-spec.md`.

Aceste roluri se stochează în tabelul comun `user_module_roles`
(`module_code = 'invoicing'`), NU în coloana globală `users.role` — cele
două sunt niveluri separate de rol, vezi `docs/data-model.md`, secțiunea
„RBAC — users.role (global) + user_module_roles (per-modul)".

## Multi-language

**UI**: chei de traducere sub namespace `invoicing.*`, română implicit,
engleză inclusă de la lansare (piață țintă RO, dar clienți cu parteneri
străini sunt comuni).

**Documente**: PDF-ul facturii se generează în `companies.preferred_language`;
opțional, un format bilingv (RO + limba clientului pe aceeași pagină) pentru
clienți din afara României — practică uzuală în facturarea B2B
intracomunitară.

## e-Factura ANAF — obligație legală, nu funcționalitate opțională

Nu e un „nice to have" adăugat ulterior — e motivul principal pentru care
Modulul 1 se vinde singur, imediat (vezi `CLAUDE.md`, ordinea modulelor).
Transmiterea prin RO e-Factura e obligatorie prin lege pentru aproape orice
factură pe care o va emite un tenant al platformei:

| Categorie | Obligatoriu din |
|---|---|
| B2B — între entități cu CIF înregistrate în scop de TVA în România | 1 iulie 2024 |
| B2C — către persoane fizice fără cod de TVA (consumatori) | 1 ianuarie 2025 |
| Facturi către persoane nerezidente înregistrate în scop de TVA în RO | 1 ianuarie 2026 |
| Persoane fizice care facturează pe CNP (fără CIF) — nișă: închirieri de camere, drepturi de autor, agricultori regim special | opțional (Legea 88/2026 a anulat obligativitatea anunțată pentru 1 iunie 2026) |

Modulul 1 emite facturi pe firme cu CIF (`companies.tax_id` = CUI), deci
intră direct sub obligația B2B/B2C de mai sus — nu sub excepția de nișă pe
CNP. Pentru un client B2C fără CUI/cod de TVA, la generarea XML se
folosește placeholder-ul standard `0000000000000` dacă nu există un CNP
declarat de client.

**Termen de transmitere**: 5 zile lucrătoare de la data emiterii (schimbat
de la 5 zile calendaristice, în vigoare din 1 ianuarie 2026 — OUG 89/2025).
**Penalizări** — motivul pentru care transmiterea nu poate fi un pas
opțional lăsat utilizatorului: neemiterea/netransmiterea unei facturi B2B
prin e-Factura se sancționează cu **15% din valoarea facturii** (amendă
nedeductibilă fiscal); întârzierea generală atrage amenzi administrative pe
plaje de mărime a contribuabilului (mari 5.000–10.000 lei, mijlocii
2.500–5.000 lei, mici/PFA 1.000–2.500 lei).

**Format**: XML UBL 2.1, profil românesc RO_CIUS (specializare a
standardului european EN 16931-1).

**Flux tehnic** (exclusiv prin `src/integrations/anaf`, niciodată apel HTTP
direct din modulul invoicing):

1. La `status = issued`: se generează XML UBL RO_CIUS din datele facturii
   deja emise (imutabile), `e_invoice_status` pornește pe `pending`.
2. Transmiterea la SPV e **asincronă și automată** — declanșată direct de
   tranziția draft→issued, nu de o acțiune manuală separată a
   utilizatorului. Nu blochează răspunsul emiterii facturii către UI.
3. La răspunsul SPV (webhook/polling job separat, nu în request-ul de
   emitere): `e_invoice_status` devine `validated`, `rejected` sau `error`,
   iar `e_invoice_id` se populează cu identificatorul SPV.
4. O respingere SPV **nu editează și nu anulează** factura (imutabilitatea
   rămâne validă) — generează o alertă vizibilă pentru rolul
   `invoicing:approver`, care corectează prin canalul legal corect: o notă
   de credit pe factura respinsă, urmată de o factură nouă.

**Risc cunoscut, acceptat pentru faza stub** (găsit de `system-orchestrator`
la auditul holistic): `InvoicesService.issue()` face tranziția draft→issued
atomic (CAS pe `status`), apoi apelează `AnafService.submitEInvoice()`, apoi
scrie `eInvoiceStatus`+audit log într-o a doua operație. Azi fereastra dintre
ele e inofensivă — `submitEInvoice` e un stub sincron, fără I/O (pasul 2 de
mai sus încă nu există efectiv). Când se implementează transmiterea SPV
reală (asincronă, cu I/O de rețea), un crash exact în acea fereastră ar
lăsa o factură `issued` (deci imuabilă — fără nicio cale de reparare directă)
cu `eInvoiceStatus` nescris. **De rezolvat obligatoriu în același batch care
implementează pasul 2 real** — fie unificând scrierile într-o singură
tranzacție, fie printr-un job de reconciliere care găsește facturi `issued`
cu `eInvoiceStatus IS NULL` și reia transmiterea.

## Integrare conformitate (adaptor ANAF izolat — vezi docs/architecture.md)

1. **Validare CUI** — la introducerea unui client nou, apel către
   serviciul public ANAF de verificare TVA prin `src/integrations/anaf`,
   nu direct din modulul invoicing.
2. **e-Factura** — vezi secțiunea dedicată de mai sus; același adaptor,
   niciodată logică HTTP proprie către SPV în interiorul modulului.
3. **e-TVA / SPV** — orice extindere ulterioară a conformității ANAF
   (declarația e-TVA precompletată etc.) trece prin același adaptor izolat,
   niciodată replicat per modul.

## Ce NU intră în Modulul 1

Gestiune de stoc reală (cantități, depozite), oferte legate de comenzi cu
livrare parțială, integrare bancară automată (reconciliere plăți), jurnalul
contabil efectiv, balanța de verificare și bilanțul (Modulul 1 doar
pregătește datele mapate pe conturi — vezi secțiunea „Pregătire pentru
modulul Contabilitate" de mai sus) — toate rămân pentru modulele 2+
conform `docs/roadmap.md`. Modulul 1 se oprește la un document de factură
complet, conform SAF-T, cu status de plată urmărit manual sau printr-un
link de plată simplu.
