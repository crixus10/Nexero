# Kit de memorie Claude Code — mini ERP SaaS

## Ce conține

```
CLAUDE.md                        ← memoria permanentă, se încarcă automat
docs/architecture.md             ← motivația deciziilor (citit doar la nevoie)
docs/data-model.md               ← schema SQL + tiparele de cod (entitlements)
docs/roadmap.md                  ← ordinea de construcție a modulelor
docs/pricing.md                  ← poziționare + structura de pachete
.claude/agents/plan-guardian.md  ← agent de verificare a respectării planului
.claude/agents/logic-reviewer.md ← agent de verificare a erorilor de logică
```

## Instalare

Copiază tot conținutul acestui kit în rădăcina repo-ului tău (nu într-un
subfolder). Claude Code încarcă automat `CLAUDE.md` la începutul fiecărei
sesiuni și descoperă automat cei doi agenți din `.claude/agents/`.

## De ce e organizat așa (economia de tokeni)

`CLAUDE.md` e mic și dens intenționat — se încarcă în fiecare sesiune, deci
orice rând în plus acolo costă tokeni de fiecare dată. Detaliile mari
(schema SQL completă, motivația deciziilor, cifrele de pricing) stau în
`docs/`, citite de Claude Code doar când sunt relevante pentru task-ul
curent, nu de fiecare dată. Cel mai mare cost de tokeni într-un proiect nou
nu e fișierul de memorie — e re-explorarea repo-ului și re-decizia unor
lucruri deja stabilite; de asta CLAUDE.md conține explicit o secțiune „ce
să NU faci”.

## Cum rulezi verificarea în paralel

După ce Claude Code termină un modul sau o modificare de logică de
business, cere explicit (sau lasă instrucțiunea din `CLAUDE.md` să
declanșeze automat):

> Rulează plan-guardian și logic-reviewer în paralel pe modificările
> recente.

Cei doi agenți sunt read-only (nu editează cod) și lucrează independent —
unul verifică respectarea arhitecturii/roadmap-ului, celălalt caută bug-uri
și breșe de securitate. Corectează ce raportează, apoi rulează din nou doar
agentul relevant pe partea corectată, nu pe tot proiectul.

## Întreținere

Actualizează `docs/roadmap.md` (bifele de la „Stare curentă”) pe măsură ce
termini module — asta e mai ieftin decât să lași Claude Code să deducă
stadiul proiectului din git log de fiecare dată. Dacă o decizie fixată în
`CLAUDE.md` se schimbă cu adevărat, editeaz-o direct acolo — nu lăsa
sesiunile viitoare să redescopere schimbarea din context conversațional.
