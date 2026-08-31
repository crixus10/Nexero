---
name: ai-addon-spec
---

# Add-on AI (OCR facturi/bonuri) — specificație

Citit la nevoie, când se lucrează în `src/modules/ai-addon` sau
`src/integrations/ai`, sau în `.claude/agents/ai-addon-guardian.md`.
Motivația strategică (dublu rol, taxare pe uz, izolare adaptor) e deja
fixată în `docs/architecture.md` și `docs/pricing.md` — aici e
specificația concretă: schema, fluxul de review, demo-ul public.

## Ce NU e — un modul de achiziții complet

Acest add-on **extrage și pre-completează**, nu gestionează un ciclu
complet de achiziții/cheltuieli (aprobare, plată, legătură cu stocul).
Rezultatul lui e un document **draft**, revizuit manual înainte să devină
orice altceva — logica de achiziții completă rămâne teritoriul Modulului 2
(Stocuri) sau al unui modul de cheltuieli viitor, neconstruit încă.
`purchase_documents` (mai jos) e intenționat un tabel de staging, nu
nucleul unui modul nou.

## Schema

```sql
-- Document extras prin OCR — draft, nu document final
CREATE TABLE purchase_documents (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id),
  source_file_url     TEXT NOT NULL,       -- R2, originalul încărcat
  status              TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','reviewed','discarded')),
  extracted_supplier_cui   TEXT,
  extracted_supplier_name  TEXT,
  extracted_total_amount   NUMERIC(14,2),
  extracted_vat_amount     NUMERIC(14,2),
  extracted_currency       TEXT DEFAULT 'RON',
  extracted_lines          JSONB,          -- linii OCR brute, neconfirmate
  confidence_score         NUMERIC(3,2),   -- 0.00-1.00, dat de model
  created_by          UUID NOT NULL REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at         TIMESTAMPTZ
);
```

`purchase_documents` filtrează după `tenant_id` ca orice tabel de
business (regula #6 din `CLAUDE.md`) — spre deosebire de demo-ul public
(mai jos), care nu creează niciodată rânduri aici.

## Fluxul intern (autentificat)

1. Utilizatorul încarcă o poză/PDF → fișierul merge în R2.
2. Backend apelează adaptorul izolat `src/integrations/ai` cu fișierul.
3. Rezultatul populează un rând nou `purchase_documents` cu
   `status = 'draft'` — salvare automată a draftului, **niciodată**
   confirmare automată ca document final.
4. Utilizatorul revede extragerea într-un ecran dedicat, corectează ce
   greșește modelul, confirmă → `status = 'reviewed'`, `reviewed_at`
   completat. Un draft nerevizuit rămâne vizibil ca „de revizuit”, nu
   dispare și nu se auto-confirmă după un interval.
5. Fiecare apel de la pasul 2 scrie un rând în `usage_events`
   (`module_code = 'ai'`, `event_type = 'ocr_scan'`) — indiferent de
   rezultat (succes sau eșec de extragere), pentru că apelul către model
   are cost, chiar dacă extragerea nu iese perfect.

## Verificare cotă (planuri cu `included_quota`)

La fiecare apel, înainte de a trimite fișierul către adaptor: verifică
suma `usage_events` a lunii curente pentru tenant față de
`plans.included_quota`. Depășirea **nu blochează silențios** — răspunde
clar (cod + mesaj) că plafonul lunar s-a atins, cu opțiune de upgrade sau
taxare pe exces (conform `docs/pricing.md`), nu doar un eșec generic.

## Demo public (fără cont) — cârligul de achiziție

Rută separată, publică, fără autentificare, fără `tenant_id`:

1. Formular simplu (o singură pagină) — încarcă o poză/PDF, apasă
   „extrage”.
2. Backend apelează același adaptor izolat, **nu** creează niciun rând în
   `purchase_documents` (nu există tenant căruia să-i aparțină) — rezultă
   direct în răspunsul HTTP, afișat pe pagină, nimic persistat legat de
   business.
3. **Rate-limiting obligatoriu**: 3 încercări/zi per IP sau per sesiune
   (cookie anonim) — verificat înainte de a apela adaptorul, nu după.
   Fără el, demo-ul devine o gaură de cost publică, nelimitată.
4. După afișarea rezultatului: CTA „Creează cont gratuit”, care poartă
   mai departe sesiunea anonimă (cookie/id) prin fluxul de signup, ca să
   poată fi corelată ulterior cu un tenant nou nou-creat — sursa pentru
   statistica „conversie demo AI → cont nou” din
   `docs/platform-admin-spec.md`. Corelarea exactă (cum se leagă sesiunea
   anonimă de tenant-ul nou) rămâne de proiectat la implementare — nu e
   trivial, dar cookie-ul/id-ul trebuie purtat de la primul pas, altfel
   nu mai poate fi reconstituit ulterior.

## Adaptorul `src/integrations/ai`

Interfață minimă, swappable (regula #7 din `CLAUDE.md`):

```typescript
export interface AiVisionAdapter {
  extractDocument(fileUrl: string): Promise<{
    supplierCui?: string;
    supplierName?: string;
    totalAmount?: number;
    vatAmount?: number;
    currency?: string;
    lines: Array<{ description: string; amount: number }>;
    confidence: number;
  }>;
}
```

Implementarea implicită folosește Anthropic Claude API (model cu vedere) —
niciun apel direct către SDK-ul modelului din afara adaptorului.

## Ce NU intră acum

- Ciclu complet de achiziții/cheltuieli (aprobare, plată, legătură stoc)
  — teritoriul unui modul viitor, nu al acestui add-on.
- Corelare exactă demo → conversie (implementare la momentul construcției,
  notă mai sus).
- Extragere din alte tipuri de documente (contracte, extrase bancare) —
  doar facturi/bonuri de achiziție, scope-ul validat de la lansare.
