# Pricing — referință, nu recalcula de la zero

## Poziționare față de concurență

- **Saga** — abonament pe număr de firme, module toate incluse, foarte
  ieftin, fără CapEx. Segment: cabinete contabile, micro-IMM.
- **WinMentor** — licență perpetuă + mentenanță, facturat pe
  utilizatori/stații, module ca add-on. Segment: IMM cu angajați.
- **Nexus ERP** — CapEx sau abonament, module separate tarifate individual,
  cost total ridicat (scenariul minim public: ~15.000 €/an, 10 utilizatori).
  Segment: mid-market, producție/retail complex.

Spațiul liber: sub bariera de cost a WinMentor, deasupra plafonului
funcțional al Saga, un ordin de mărime sub Nexus.

## Structura de pachete recomandată

Axă principală: **număr de firme** (ca Saga — se potrivește comportamentului
IMM-urilor românești, multe cu 2-3 entități, și canalului cabinete
contabile). Axă secundară: **utilizatori incluși** (ca WinMentor). Module
avansate = add-on separat, niciodată diferențiator de bază (evită capcana
de complexitate Nexus).

| | Start | Business | Enterprise |
|---|---|---|---|
| Preț orientativ | ≈ 30 €/lună | ≈ 65-80 €/lună | negociat pe volum |
| Firme incluse | 1 | 3 | nelimitat |
| Utilizatori incluși | 1-2 | 5 | nelimitat/prag mare |
| Module de bază | Facturare, stocuri, clienți/furnizori | + contabilitate primară, rapoarte, CRM simplu | + toate |
| Module avansate | — | add-on per modul | add-on per modul, discount volum |
| Target | PFA / micro-IMM, o firmă | IMM mediu, 2-3 entități | cabinete contabile, holdinguri, producție |

Prețurile sunt punct de plecare, nu finale — validează cu structura de
costuri și marja țintă înainte de a le fixa în cod (ex. în `plans` din
`docs/data-model.md`).

## Reguli de packaging

- Fiecare modul nou lansat capătă preț propriu din prima zi (vezi
  `docs/roadmap.md`) — nu așteaptă „pachetul final”.
- Nu adăuga o a treia axă de facturare (ex. număr de înregistrări) fără
  semnal clar de piață — concurența analizată nu o folosește, iar
  complexitatea suplimentară strică simplitatea deciziei de cumpărare.
