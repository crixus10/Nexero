# Roadmap de construcție + monetizare pe module

Ordinea nu e arbitrară — fiecare modul trebuie să aducă venit înainte să
investești în următorul. Nu reordona fără o decizie explicită înregistrată
aici (adaugă o linie „Decizie: ...” sub tabel).

| # | Modul | De ce în această ordine | Cross-sell |
|---|---|---|---|
| 1 | Facturare + e-Factura ANAF | Obligație legală — clienții au nevoie acum; se vinde singur, fără restul ERP-ului | — |
| 2 | Stocuri + clienți/furnizori | Extensie naturală pentru cine are deja modulul 1; cost de achiziție ≈ 0 | upsell pe baza existentă |
| 3 | Contabilitate primară + rapoarte + SAF-T | A doua obligație legală; deschide segmentul cabinete contabile (canal de volum) | cross-sell către contabili |
| 4 | CRM simplu | Cerere organică de la clienți care vor gestiune vânzări/lead-uri | upsell segment Business |
| 5+ | HR/salarizare, producție, POS, integrări bancare | Doar după cerere confirmată de clienți reali, nu speculativ | add-on Enterprise |

## Structura de date — sursă de adevăr: schema SAF-T

Documentele oficiale ANAF pentru declarația SAF-T (D406) sunt în
[`docs/saft/`](./saft/):

- `Ro_SAFT_Schema_v249_2025.xsd` — schema XSD oficială (rădăcină `AuditFile`,
  cu `Header`, `MasterFiles` — conturi, clienți, furnizori, produse — și
  secțiunile de tranzacții).
- `RO_SAFT_SchemaDefCod_16.02.2026.xlsx` — definiția câmp-cu-câmp + coduri.
- `SAF_T_Ghidul_D406_1712021.pdf` — ghidul explicativ ANAF.

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
- [ ] Modulul 2 — Stocuri + clienți/furnizori
- [ ] Modulul 3 — Contabilitate primară + SAF-T
- [ ] Modulul 4 — CRM simplu
- [ ] Modulul 5+ — (neînceput, în așteptarea cererii confirmate)
