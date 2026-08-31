# Kit de memorie Claude Code — mini ERP SaaS

## Ce conține

```
CLAUDE.md                                    ← memoria permanentă, se încarcă automat
docs/architecture.md                         ← motivația deciziilor (citit doar la nevoie)
docs/data-model.md                           ← schema SQL + tiparele de cod (nucleu: auth, entitlements, billing)
docs/invoicing-spec.md                       ← schema + logica Modulului 1 (Facturare)
docs/customer-portal-spec.md                 ← schema + logica Portalului Clienți
docs/platform-admin-spec.md                  ← schema + logica Panelului Admin Intern
docs/ai-addon-spec.md                        ← schema + logica add-on-ului AI (OCR)
docs/saft-mapping.md                         ← mapare distilată SAF-T (D406), referință rapidă
docs/saft/                                   ← documentele oficiale ANAF (XSD/XLSX/PDF)
docs/roadmap.md                              ← ordinea de construcție a modulelor
docs/pricing.md                              ← poziționare + structura de pachete
docs/deploy.md                               ← runbook provizionare VPS Hetzner + Docker
.claude/agents/plan-guardian.md              ← arhitectură/roadmap/CLAUDE.md
.claude/agents/logic-reviewer.md             ← erori de logică, breșe de securitate
.claude/agents/docs-sync.md                  ← sincronizare docs/README/CLAUDE.md cu codul real
.claude/agents/invoicing-guardian.md         ← agent de domeniu — Modulul 1 (Facturare)
.claude/agents/customer-portal-guardian.md   ← agent de domeniu — Portal Clienți
.claude/agents/platform-admin-guardian.md    ← agent de domeniu — Panel Admin Intern
.claude/agents/ai-addon-guardian.md          ← agent de domeniu — add-on AI
.claude/agents/rbac-guardian.md              ← agent de domeniu — nucleu RBAC (src/rbac, src/users)
.claude/agents/system-orchestrator.md        ← corelează toate rapoartele de mai sus, rulat ultimul
```

## Instalare

Copiază tot conținutul acestui kit în rădăcina repo-ului tău (nu într-un
subfolder). Claude Code încarcă automat `CLAUDE.md` la începutul fiecărei
sesiuni și descoperă automat toți agenții din `.claude/agents/`.

## De ce e organizat așa (economia de tokeni)

`CLAUDE.md` e mic și dens intenționat — se încarcă în fiecare sesiune, deci
orice rând în plus acolo costă tokeni de fiecare dată. Detaliile mari
(schema SQL completă, motivația deciziilor, cifrele de pricing) stau în
`docs/`, citite de Claude Code doar când sunt relevante pentru task-ul
curent, nu de fiecare dată. Cel mai mare cost de tokeni într-un proiect nou
nu e fișierul de memorie — e re-explorarea repo-ului și re-decizia unor
lucruri deja stabilite; de asta CLAUDE.md conține explicit o secțiune „ce
să NU faci”.

## Cum rulezi verificarea obligatorie (4 pași)

Modelul e pe două nivele: un agent de domeniu per modul + trei agenți de
sistem (arhitectură, logică/securitate, igienă documentară) + un
orchestrator care corelează tot la final. Nu rula doar doi agenți „ca
înainte” — CLAUDE.md fixează procedura completă:

1. Rulează **în paralel**, într-un singur mesaj: `plan-guardian`,
   `logic-reviewer`, `docs-sync`, și agentul (sau agenții) de domeniu ai
   modulului pe care ai lucrat (ex. `invoicing-guardian` pentru
   `src/modules/invoicing`). Dacă schimbarea atinge mai multe module, rulează
   toți agenții de domeniu relevanți, nu doar unul. Un modul fără agent
   dedicat încă → creează unul nou după tiparul din
   `.claude/agents/invoicing-guardian.md` înainte să continui.
2. Corectează orice BLOCANT; re-rulează doar agentul relevant pe partea
   corectată, nu tot proiectul. `docs-sync` nu raportează niciodată
   BLOCANT, dar IMPORTANT-urile lui se corectează la fel de serios.
3. Abia după ce toți agenții rulați raportează fără blocante, invocă
   `system-orchestrator` — cu rapoartele complete ale tuturor agenților
   incluse explicit în promptul de apel (nu le poate citi singur din
   context).
4. Nu marca task-ul complet până `system-orchestrator` nu răspunde
   `ARMONIZAT` sau conflictele lui nu sunt rezolvate.

Toți agenții sunt read-only (nu editează cod) și lucrează independent.
Detaliu complet al procedurii: `CLAUDE.md`, secțiunea „Verificare
obligatorie înainte de a marca un task «gata»”.

## Întreținere

Actualizează `docs/roadmap.md` (bifele de la „Stare curentă”) pe măsură ce
termini module — asta e mai ieftin decât să lași Claude Code să deducă
stadiul proiectului din git log de fiecare dată. Dacă o decizie fixată în
`CLAUDE.md` se schimbă cu adevărat, editeaz-o direct acolo — nu lăsa
sesiunile viitoare să redescopere schimbarea din context conversațional.
