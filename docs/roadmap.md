# Roadmap de construcție + monetizare pe module

Ordinea nu e arbitrară — fiecare modul trebuie să aducă venit înainte să
investești în următorul. Nu reordona fără o decizie explicită înregistrată
aici (adaugă o linie „Decizie: ...” sub tabel).

| # | Modul | De ce în această ordine | Cross-sell |
|---|---|---|---|
| 1 | Facturare + e-Factura ANAF | Obligație legală — clienții au nevoie acum; se vinde singur, fără restul ERP-ului | — |
| 1+ | Add-on AI (OCR facturi/bonuri de achiziție) | Construit imediat alături de Modulul 1, nu numerotat separat — cost de integrare mic, caz de folosire validat de la lansare, dublu rol (funcție + cârlig public de achiziție clienți); specificație completă `docs/ai-addon-spec.md` | demo public fără cont → conversie la trial |
| 1+ | Portal Clienți | Construit imediat alături de Modulul 1 — notificare automată la fiecare factură emisă, identitate de portal unică pe platformă (`docs/customer-portal-spec.md`) | destinatar de factură → potențial tenant nou |
| 1+ | Panel Admin Intern (doar Mittani Solutions) | Construit imediat alături de Modulul 1, de îndată ce există încasări reale de urmărit — invizibil pentru clienți, acces exclusiv prin `PlatformAdminGuard` (`docs/platform-admin-spec.md`) | — (tooling intern, nu se vinde) |
| 2 | Stocuri + clienți/furnizori | Extensie naturală pentru cine are deja modulul 1; cost de achiziție ≈ 0 | upsell pe baza existentă |
| 3 | Contabilitate primară + rapoarte + SAF-T | A doua obligație legală; deschide segmentul cabinete contabile (canal de volum) | cross-sell către contabili |
| 4 | CRM simplu | Cerere organică de la clienți care vor gestiune vânzări/lead-uri | upsell segment Business |
| 5+ | HR/salarizare, producție, POS, integrări bancare | Doar după cerere confirmată de clienți reali, nu speculativ | add-on Enterprise |

**Decizie:** Modulul 4 (CRM) a fost construit înaintea Modulelor 2-3
(Stocuri, Contabilitate+SAF-T), la cererea explicită a utilizatorului
(2026-09-01) — interfață identică cu demo-ul Metronic CRM, etichetată
„Clienți" în UI, înlocuind fostul nomenclator simplu „Clienți" din
Facturare (`Customer`→`Company`, vezi `docs/crm-spec.md`). Modulele 2-3
rămân neconstruite — de reluat în ordinea normală când apare cererea
reală, nu retroactiv doar ca să respecte ordinea tabelului.

## Structura de date — sursă de adevăr: schema SAF-T

Documentele oficiale ANAF pentru declarația SAF-T (D406) sunt în
[`docs/saft/`](./saft/):

- `Ro_SAFT_Schema_v249_2025.xsd` — schema XSD oficială (rădăcină `AuditFile`,
  cu `Header`, `MasterFiles` — conturi, clienți, furnizori, produse — și
  secțiunile de tranzacții).
- `RO_SAFT_SchemaDefCod_16.02.2026.xlsx` — definiția câmp-cu-câmp + coduri.
- `SAF_T_Ghidul_D406_1712021.pdf` — ghidul explicativ ANAF.

`docs/saft-mapping.md` distilează din aceste documente doar câmpurile
relevante pentru Modulul 1 (TaxTable, SalesInvoices, GeneralLedgerAccounts)
— referință rapidă, nu înlocuiește documentele oficiale de mai sus la
construcția efectivă a Modulului 3.

**Regulă:** structura de date a fiecărui modul de business (facturare,
stocuri, contabilitate) se proiectează având ca referință obligatorie
această schemă — entitățile și câmpurile din `docs/data-model.md` trebuie
mapabile direct pe elementele din `AuditFile`, ca generarea declarației
SAF-T (modulul 3) să fie o serializare a datelor deja existente, nu o
remodelare ulterioară. Nu inventa câmpuri paralele care nu au corespondent
în schemă fără motiv documentat.

Conform regulii de arhitectură #5 (CLAUDE.md), generarea efectivă a
XML-ului SAF-T rămâne izolată în `src/integrations/anaf` — schema de mai
sus e referință de proiectare a datelor, nu loc pentru logică de business.

## Reguli

- Niciun modul nu se lansează fără preț propriu, chiar dacă e „beta”.
- Nucleul (auth, tenant management, entitlements, billing, adapter ANAF de
  bază) se construiește o singură dată, la modulul 1 — restul modulelor
  doar se conectează la el.
- Un modul din faza 5+ nu începe înainte ca modulele 1-4 să fie stabile
  (fără blocante raportate de `logic-reviewer`) și să aibă clienți plătitori
  reali.

## Stare curentă

_(Actualizează manual sau prin Claude Code pe măsură ce construiești —
ține evidența aici, nu doar în issue tracker, ca sesiunile viitoare să știe
instant unde s-a rămas fără să exploreze tot codul.)_

- [ ] Modulul 1 — Facturare + e-Factura ANAF
  - Progres (fazare auto-conținută în repo — NU exista/nu se mai referă la
    un plan extern `.docx`, urmărirea completă stă aici + `docs/invoicing-spec.md`):
    [x] Fază A — schema (`prisma/migrations/20260827150000_add_invoicing_schema`
    + `20260831163611_invoicing_schema_hardening`) + seed cote TVA;
    [x] Fază B — CRUD clienți (validare CUI prin `src/integrations/anaf`) +
    CRUD produse (`.../products/`) — clienții au fost mutați ulterior în
    `src/modules/crm/companies/` (Modulul 4, `Customer`→`Company`, vezi
    mai jos și `docs/crm-spec.md`);
    [x] Fază C — motorul de facturare (`src/modules/invoicing/invoices/`,
    `.../invoice-series/`): numerotare atomică pe serie, creare factură
    draft + linii, rezolvare cotă TVA pe linie (automat din categoria
    produsului sau override manual), emitere (draft→issued) cu imutabilitate
    impusă în service (nu doar convenție), verificare defensivă
    liniile Σ = invoiceAmount la emitere, audit log, notă de credit (storno)
    legată de original prin `reversedInvoiceId`, declanșare e-Factura (stub
    — `AnafService.submitEInvoice`, status `pending`, fără transmitere
    reală SPV încă — lipsesc credențiale OAuth ANAF);
    [x] Fază D — RBAC per-modul (`user_module_roles` + `ModuleRoleGuard`) +
    management complet de useri (`src/users/`, `GlobalRoleGuard`) — condiție
    pentru segregarea issuer/approver cerută de `docs/invoicing-spec.md`,
    verificată live end-to-end (revocare rol → 403 imediat, fără așteptare
    expirare token);
    [ ] restul (proformă/avans, facturi recurente, transmitere SPV reală,
    e-TVA) — de detaliat când devine relevant, nu speculativ acum.
- [ ] Add-on AI — OCR facturi/bonuri (+ demo public/cârlig)
- [ ] Portal Clienți — notificare automată + identitate globală de portal
- [ ] Panel Admin Intern — vizibil doar Mittani Solutions, plan/încasări/consum per client + agregate
- [ ] Modulul 2 — Stocuri + clienți/furnizori
- [ ] Modulul 3 — Contabilitate primară + SAF-T
- [x] Modulul 4 — CRM ("Clienți" în UI) — construit înaintea Modulelor
  2-3, vezi „Decizie" de mai sus + `docs/crm-spec.md`: `companies`
  (fost `customers`)/`contacts`/`deals`/`tasks`/`notes`
  (`src/modules/crm/`), coduri auto-generate (`CodeSequenceService`,
  nucleu), RBAC `crm:viewer/agent/admin`, dashboard cu agregări reale,
  `Deal.invoiceId` legat de facturi reale. Rămas: rapoarte/export CRM,
  pipeline drag-and-drop — nespecificat încă.
- [ ] Modulul 5+ — (neînceput, în așteptarea cererii confirmate)
