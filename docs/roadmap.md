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
