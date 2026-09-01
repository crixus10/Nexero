# Modulul CRM ("Clienți" în UI) — specificație

Modulul 4 din `docs/roadmap.md` ("CRM simplu"), construit înaintea
Modulelor 2-3 la cererea explicită a utilizatorului — vezi linia
„Decizie: ..." din `docs/roadmap.md` pentru înregistrarea acestei
reordonări. Cod de modul: `crm`. Etichetat **„Clienți"** în UI (tab de sus,
alături de „Facturare") — nu confunda cu „clienți/furnizori" simplu,
inclus în pachetul Start la Modulul 2 (`docs/pricing.md`); modulul `crm`
e add-on de la pachetul Business în sus.

Interfața (meniuri, câmpuri, layout) e modelată identic după demo-ul
Metronic CRM (https://keenthemes.com/metronic/concepts/vite/crm), cu
devierile documentate mai jos.

## De ce `Company` înlocuiește `Customer`

Fostul `Customer` (modulul Facturare, câmpuri SAF-T: `taxId`/CustomerTaxID,
`address`, `isVatPayer` etc.) a fost **redenumit**, nu duplicat, în
`Company` — o singură sursă de adevăr pentru „cine se facturează", acum
îmbogățită cu atributele CRM (categorii, echipă, conexiune, venit
estimat). O companie paralelă separată de „clientul de facturat" ar fi
însemnat două înregistrări pentru aceeași firmă, cu risc real de
divergență a CUI-ului/adresei folosite pe factură. `Invoice.companyId`
(fost `Invoice.customerId`) e FK direct către `companies`, ca înainte.

Migrare: `prisma/migrations/20260901160000_add_crm_module` — `RENAME
TABLE`/`RENAME COLUMN`, nu `DROP`+`CREATE` — clienții și facturile
existente au fost păstrate (verificat cu date reale la migrare).

## Schema de date

Toate tabelele sunt tenant-scoped (`tenant_id`, regula #6 CLAUDE.md).

- **`companies`** (fost `customers`) — `companyCode` (auto-generat, vezi
  mai jos), `taxId` (cod fiscal/CUI, opțional — validat prin
  `src/integrations/anaf` dacă e dat; **cerință explicită**: dacă ANAF e
  indisponibil temporar, CUI-ul introdus manual e acceptat neverificat, nu
  respins — vezi „Validare CUI — degradare la introducere manuală” mai
  jos), `name`, `address`/`postalCode`/
  `city`/`country`, `isVatPayer`, `preferredLanguage`, `website`, `email`,
  `phone`, `description`, `categories` (`text[]`), `connectionStrength`
  (`very_weak|weak|medium|strong|very_strong`), `estimatedRevenueRange`
  (text liber, ex. „100K-500K").
- **`contacts`** — `contactCode` (auto), `name`, `email`, `phone`,
  `address`, `position`, `companyId` (opțional — un contact fără companie
  e un „lead"), `socialLinks` (`Json?`, `[{platform, url}]` — doar afișaj,
  niciodată filtrat).
- **`deals`** — `dealCode` (auto, `DEAL-{an}-{secvență}`), `title`,
  `contactId`/`companyId` (opționale), `totalValue`/`currency` (RON
  implicit — nu USD ca-n demo, monedă deja fixată la nivel de produs),
  `status` (`proposal|negotiation|closed_won|closed_lost`), `priority`
  (`low|medium|high`), `dealDate`, `expectedCloseDate`,
  `discountPercent`, `paymentMethod`, **`invoiceId`** (opțional, FK REALĂ
  către `invoices` — nu un string decorativ ca-n demo; verificată explicit
  că aparține aceluiași tenant în `DealsService`, FK-ul Prisma singur nu
  garantează asta).
- **`tasks`** / **`notes`** — `title`, `priority`, `status`
  (`pending|in_progress|done`), legătură opțională la CEL MULT una din
  `companyId`/`contactId`/`dealId`, `assignees` (many-to-many către
  `users` reali prin `task_assignees`/`note_assignees` — nu avatare
  fictive). `notes` are în plus `content`, `category`, `isFavorite`.
- **`company_team_members`** — echipa/proprietarii de cont ai unei
  companii (avatarele din demo), useri reali.

## Coduri auto-generate

Cerință explicită a utilizatorului. `CodeSequenceService`
(`src/common/code-sequence.service.ts`, mecanism de NUCLEU, documentat și
în `docs/data-model.md`) alocă atomic (`upsert` cu `increment`, fără
`MAX(cod)+1`) un număr per `(tenantId, entityType)`, folosit de:
`companies` → `CLI-0001`, `products` → `PRD-0001`, `contacts` →
`CTC-0001`, `deals` → `DEAL-{an}-0001` (secvență separată per an,
`entityType = 'deal:{an}'`). `invoice_series.seriesCode` rămâne tastat
manual — identifică o serie fiscală reală (FACT/PROF/STORNO), nu un
simplu număr de ordine.

Distincție importantă față de `InvoiceSeries.nextNumber`: acolo o gaură
în numerotare e o încălcare legală SAF-T, de-asta alocarea se face în
aceeași tranzacție cu inserarea facturii. Aici (companii/produse/
contacte/deal-uri) codul e un identificator mnemonic — o gaură ocazională
nu are nicio implicație legală, deci `CodeSequenceService.next()` nu
cere un `$transaction` comun cu insert-ul.

## Validare CUI — degradare la introducere manuală

`AnafService.validateCui` (`src/integrations/anaf`) distinge deja două
cazuri: `BadRequestException` (format invalid sau CUI negăsit în registru
— eroare reală a utilizatorului) și `ServiceUnavailableException` (rețea/
5xx/timeout/eroare de business ANAF — o cădere temporară a serviciului,
nu o problemă a CUI-ului dat). **Cerință explicită a utilizatorului**: doar
al doilea caz nu trebuie să blocheze salvarea companiei.

`CompaniesService.resolveTaxId()` (`create`/`update`) prinde exact
`ServiceUnavailableException` și cade pe `AnafService.
normalizeCuiUnverified()` — normalizează CUI-ul (cifre pure, fără „RO”)
FĂRĂ să-l verifice online, îl salvează ca atare, și loghează un `WARN`
(`ANAF indisponibil — CUI „…” acceptat neverificat`). `isVatPayer` rămâne
în acest caz ce a dat explicit utilizatorul, sau `true` implicit — nu
există sursă autoritativă ANAF de folosit. Un `BadRequestException`
(CUI cu format clar greșit, sau negăsit când ANAF chiar a răspuns)
continuă să fie respins ca înainte — asta rămâne o eroare reală, nu se
ocolește niciodată.

## Roluri multi-user (RBAC pe acest modul)

| Rol | Poate |
|---|---|
| `crm:viewer` | citește companii/contacte/deal-uri/sarcini/note |
| `crm:agent` | + creează/editează companii/contacte/deal-uri/sarcini/note, șterge contacte/deal-uri/sarcini/note |
| `crm:admin` | + șterge companii (acțiune mai greu de anulat — o companie poate fi referită de facturi) |

Aceleași 2 verificări obligatorii pe fiecare handler ca la Facturare:
`@RequireModule('crm')` (firma are modulul activ) + `@RequireModuleRole(...)`
(cine din firmă poate face acțiunea) — niciodată doar una din ele.

## Gărzi IDOR pe legăturile opționale

Orice câmp care leagă o înregistrare CRM de alta prin ID (`Deal.invoiceId`,
`Task`/`Note`.`companyId`/`contactId`/`dealId`, `assigneeUserIds`,
`Company.teamUserIds`) e verificat explicit că aparține aceluiași tenant
înainte de scriere (`assertInvoiceBelongsToTenant`,
`assertLinksBelongToTenant`, `assertUsersBelongToTenant` — vezi
`*.service.ts` din `src/modules/crm/*`). FK-ul Prisma singur NU verifică
`tenant_id` — fără gărzile astea, un `crm:agent` ar putea lega o
înregistrare de un ID ghicit din alt tenant, o scurgere reală de date
denormalizate (nume/email) la afișare.

## Devieri asumate față de demo (aprobate în planul de implementare)

- **Monedă**: RON implicit pe `deals` (nu USD).
- **„AI prediction to complete all tasks"** (text decorativ din Tasks
  Overview, demo): omis — ar încălca regula #7 CLAUDE.md (orice
  interacțiune AI trece prin `src/integrations/ai` + `usage_events`, fără
  excepție).
- **Echipa/assignees**: useri reali ai firmei (`users`), nu nume fictive.
- **Profil companie** (`CompanyDetailPage`): tab-uri Overview/Notes/
  Tasks/Team. Fără Activity (log de audit generic nedefinit încă), Files
  (ar cere Cloudflare R2, nedefinit pentru acest modul) și Comments (ar
  cere un model nou, nedefinit) — se adaugă separat, când există un motiv
  real, nu ca UI gol fără date reale în spate.
- **Grafice Dashboard**: date reale agregate din `deals`/`tasks`
  existente (ex. Pipeline Value lunar din `dealDate`), nu cifre
  fabricate ca-n demo.

## Ce NU face acest modul (încă)

- Nu generează rapoarte/export CRM — doar CRUD + dashboard cu agregări
  simple.
- Nu are un concept de „pipeline" cu drag-and-drop între status-uri —
  schimbarea `status`-ului unui deal se face din formularul de editare.
- Nu integrează cu Portal Clienți sau Add-on AI — pot fi cross-sell-uri
  ulterioare, nespecificate acum.
