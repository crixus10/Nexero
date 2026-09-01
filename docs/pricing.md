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

**„Clienți" (UI) ≠ „clienți/furnizori" (Modulul 2).** Tab-ul de sus
„Clienți" din aplicație e modulul CRM (cod `crm`, `docs/crm-spec.md`) —
add-on de la pachetul Business în sus, cu companii/contacte/deal-uri/
sarcini/note. E distinct de „clienți/furnizori" simplu, inclus în
pachetul Start la Modulul 2 (Stocuri) — un nomenclator minim de
parteneri, fără CRM. Modulul 2 nu există încă (vezi `docs/roadmap.md`,
secțiunea „Decizie"); când se construiește, va trebui clarificat dacă
„clienți/furnizori" de acolo rămâne un nomenclator separat sau reutilizează
`companies` din `crm` — de decis atunci, nu speculativ acum.

## Add-on AI (OCR facturi/bonuri) — pe uz, nu în abonamentul plat

Singura excepție de la cele două axe de mai sus, și e intenționată: cost
marginal real per apel, spre deosebire de restul produsului. Structură
orientativă (validează cu costul real per apel către model înainte de a
fixa cifrele):

| | Start | Business | Enterprise |
|---|---|---|---|
| Scanări incluse/lună | 20 (teaser de upgrade) | 200 | negociat pe volum |
| Preț peste plafon | per scanare, cost + marjă | per scanare, cost + marjă | negociat |

**Demo public (cârlig, fără cont)**: 3 scanări gratuite/zi per IP sau
sesiune, fără plan, fără facturare — cost acoperit din bugetul de achiziție
clienți, nu din structura de pricing de mai sus. Obligatoriu limitat (vezi
`docs/architecture.md`, secțiunea „Add-on AI") — fără plafon, devine gaură
de cost deschisă public, nu cârlig de marketing.

Asta nu contrazice regula de mai jos („nicio a treia axă de facturare") —
acolo e vorba de structura de bază a planurilor (firme × utilizatori);
metering-ul pe uz se aplică punctual, doar la funcționalități cu cost
marginal real.

## Portal Clienți — gratuit pentru destinatar, inclus pentru tenant

Nu se taxează separat, pe niciuna din cele două părți implicate:

- **Portal user (destinatarul facturii)** — mereu gratuit, fără excepție.
  Taxarea accesului la propriile facturi ar contrazice motivul pentru care
  există portalul (motor de creștere a bazei de utilizatori — vezi
  `docs/customer-portal-spec.md`).
- **Tenant (emitentul)** — funcționalitatea de bază (vizualizare facturi +
  status plată de către clienții lui) inclusă gratuit din pachetul Start,
  ca diferențiator față de Saga/WinMentor, nu ca add-on separat.
- **Viitor, la cerere confirmată, nu acum**: funcționalități avansate
  (plată online din portal, branding propriu al tenant-ului, remindere
  automate) ca add-on plătit de la Business în sus — pe tenant, niciodată
  pe portal user.

## Reguli de packaging

- Fiecare modul nou lansat capătă preț propriu din prima zi (vezi
  `docs/roadmap.md`) — nu așteaptă „pachetul final”.
- Nu adăuga o a treia axă de facturare (ex. număr de înregistrări) fără
  semnal clar de piață — concurența analizată nu o folosește, iar
  complexitatea suplimentară strică simplitatea deciziei de cumpărare.
