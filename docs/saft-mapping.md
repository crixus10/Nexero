# SAF-T (D406) — structura de referință

Citit de orice modul care generează sau consumă date financiare (facturare,
contabilitate, stocuri). Sursa: schema XSD oficială ANAF v2.4.9
(`docs/saft/Ro_SAFT_Schema_v249_2025.xsd`). Scopul acestui fișier: schema
de date a fiecărui modul se proiectează O SINGURĂ DATĂ să mapeze direct pe
câmpurile de mai jos, ca exportul D406 (construit mai târziu, în modulul 3
— Contabilitate + SAF-T) să fie o transformare, nu o restructurare a
datelor existente.

**Notă de precizie** (găsită la verificare directă contra XSD-ului oficial,
`invoicing-guardian`): câteva nume folosite mai jos și în comentariile
`(SAF-T)` din `prisma/schema.prisma` sunt aproximări funcționale, nu
elemente XSD literale — cine construiește exportul D406 (Modulul 3) are
nevoie de un layer de transformare explicit, nu de o simplă redenumire de
coloană:

| Câmp intern | Etichetat ca | Realitate în XSD-ul oficial |
|---|---|---|
| `invoices.invoice_amount` | „InvoiceAmount" | nu există ca atare; suma de control reală e `GrossTotal`, în `InvoiceDocumentTotals` |
| `invoices.tax_point_date` | câmp de header | `TaxPointDate` există doar la nivel de `InvoiceLine`, nu la header-ul de factură |
| `invoices.e_invoice_id` / `DocumentStatus` | „eInvoiceID (SAF-T)" | nu apar ca elemente în acest XSD (generic OECD + extensii RO) — concepte ANAF/RO_CIUS, nu (încă) parte din acest fișier de schemă |
| `invoice_lines.tax_code_id` | „TaxID (SAF-T)" | XSD-ul nu are un `TaxID` unic; la nivel de linie cere perechea `TaxType`+`TaxCode` (`TaxInformationStructure`) — FK-ul spre `tax_codes` acoperă asta funcțional (join dă ambele valori), doar eticheta e imprecisă |

## Cine e obligat să depună D406 (2026)

| Categorie | Obligatoriu din |
|---|---|
| Mari contribuabili (CA > 100M lei) | 1 ianuarie 2022 |
| Contribuabili mijlocii (CA 20-100M lei) | 1 ianuarie 2023 |
| Mici cu contabilitate în partidă dublă (SRL, SA, microentități) | 1 ianuarie 2025 |
| PFA cu contabilitate simplă | neobligatoriu (poate fi cerut punctual de ANAF, termen 30 zile) |

Chiar dacă un client concret nu e încă obligat, structura de date se
construiește aliniată SAF-T de la primul modul — costă mult mai puțin acum
decât o migrare ulterioară.

## Cotele TVA — curente + istoric obligatoriu

De la 1 august 2025 (Legea 141/2025): cota standard **21%**, cota redusă
unificată **11%** (a înlocuit vechile 9% și 5%, active concurent înainte de
această dată), plus 0%/scutit. Un document nou (emis după 1 august 2025)
folosește exclusiv 21%/11%/0% — niciodată 19%/9%/5%.

Cotele vechi **nu se șterg** din `TaxTable`/`tax_codes` — rămân ca istoric,
cu perioadă de valabilitate (`valid_from`/`valid_to`), pentru că un export
SAF-T poate acoperi o perioadă din trecut sau o factură poate fi corectată
printr-o notă de credit legată de un original emis sub cota veche. Detaliul
modelului de istoric: `docs/invoicing-spec.md`, secțiunea „Cote TVA —
istoric”.

## Cele 7 secțiuni ale fișierului D406

1. **Header** — identificare raportare și contribuabil
2. **MasterFiles** — nomenclatoare permanente (conturi, clienți, furnizori, produse, cote TVA)
3. **GeneralLedgerEntries** — jurnalul contabil complet
4. **SalesInvoices** — facturi emise
5. **PurchaseInvoices** — facturi primite
6. **Payments** — mișcări de trezorerie
7. **MovementOfGoods** — mișcări de stoc

## MasterFiles — câmpuri de referință

**Customers**: `CustomerID` (identificator intern stabil), `CustomerTaxID`
(CUI/CNP), `CompanyName`, `Address`, `PostalCode`, `City`, `AccountID`
(cont contabil asociat), `OpeningDebitBalance`/`OpeningCreditBalance`.

**Products**: `ProductCode`, `ProductDescription`, `UnitOfMeasure` (din
UOMTable), `TaxID` (referință TaxTable), `GeneralLedgerAccounts`,
`UnitPrice`.

**TaxTable**: `TaxType` (Standard/Reduced/Exempt), `TaxCode` (cod ANAF, ex.
S21 pentru 21% standard, R11 pentru 11% redusă), `TaxPercentage`,
`Description`.

**GeneralLedgerAccounts**: `AccountID` (cod ANAF standardizat: 101, 121,
401, 411, 701...), `AccountDescription`, solduri de deschidere/închidere.
Modulul 1 pregătește deja mapările necesare pentru Modulul 3
(`tax_codes.vat_account_output`/`vat_account_input`, `products.
revenue_account` — text simplu acum, vor deveni FK către o tabelă reală
`accounts` când Modulul 3 formalizează planul de conturi). Detaliu complet
al notei contabile derivate: `docs/invoicing-spec.md`, secțiunea
„Pregătire pentru modulul Contabilitate".

## SalesInvoices — câmpuri de referință

**Invoice header**: `InvoiceNo` (serie + număr, ex. `FACT/2026/0001`),
`InvoiceDate`, `InvoiceType` (Normal/CreditNote/DebitNote/DownPayment),
`CustomerID` (referință MasterFiles), `DocumentStatus`
(Issued/Cancelled), `InvoiceAmount`, `TaxPointDate`, `eInvoiceID`
(identificator SPV, pentru cross-verificare cu e-Factura — obligatorie
pentru aproape orice factură emisă de Modulul 1, vezi
`docs/invoicing-spec.md`, secțiunea „e-Factura ANAF").

**InvoiceLine**: `LineNumber`, `ProductCode` (referință Products),
`Description`, `Quantity`, `UnitOfMeasure`, `UnitPrice`, `LineAmount`,
`TaxID` (referință TaxTable), `TaxAmount`.

**PurchaseInvoices** urmează aceeași structură, cu `SupplierID` în loc de
`CustomerID` și un câmp suplimentar `TaxDeductible`.

## Validări critice (impuse de ANAF la depunere)

- Suma liniilor de factură trebuie să fie egală cu `InvoiceAmount`.
- Fiecare `ProductCode` folosit pe o linie trebuie să existe în
  `MasterFiles > Products`.
- Fiecare `TaxID` folosit trebuie să existe în `TaxTable`.
- Fiecare `CustomerID` folosit trebuie să existe în `MasterFiles > Customers`.
- `GeneralLedgerEntries` trebuie balansate (debit = credit pe fiecare
  înregistrare).
- Cross-verificare: `eInvoiceID` din SalesInvoices trebuie să corespundă cu
  ce a validat SPV pentru aceeași factură (cotă TVA, sumă, dată).

## Ce înseamnă asta pentru modulul de facturare

Schema din `docs/invoicing-spec.md` e proiectată să populeze direct
`SalesInvoices` și porțiunea relevantă din `MasterFiles` — nu redenumi și
nu restructura coloanele fără să actualizezi și acest fișier.
