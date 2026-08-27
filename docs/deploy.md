# Deploy — provizionare VPS Hetzner + Docker

Runbook de referință. Documentează pașii — **nu au fost executați automat**
împotriva niciunui server real; de urmat manual (sau de cerut explicit unei
sesiuni Claude Code cu acces la un server concret).

Țintă: 1 VPS Hetzner Cloud **CX33**, regiune UE, cu Docker + Docker Compose
— exact decizia din `docs/architecture.md` ("De ce Hetzner", "Cost de
infrastructură": ≈ 11-15 €/lună la pornire). Nu k8s, nu multi-server — un
monolit modular pe un singur VPS, per `docs/architecture.md` ("De ce
monolit modular").

**O decizie nouă, nefixată încă în `docs/architecture.md`**: reverse proxy
+ TLS. Runbook-ul de mai jos folosește **Caddy** (HTTPS automat via Let's
Encrypt, config de câteva linii, un singur binar) — ales pentru că se
potrivește filosofiei „cost mic, control total", nu pentru că ar fi deja
decizie fixată. Confirmă explicit înainte să-l consideri canon; odată
confirmat, adaugă-l în `docs/architecture.md` ca decizie de stack.

## 0. Ce se instalează unde

```
VPS Hetzner CX33 (Ubuntu 24.04 LTS, regiune UE)
├── Docker Engine + Compose plugin
└── docker-compose.prod.yml
    ├── postgres   (volum persistent, NEexpus public)
    ├── app        (imagine construită din Dockerfile, rulează migrațiile la pornire)
    └── caddy      (porturile 80/443, TLS automat, reverse proxy → app:3000)
```

## 1. Creează serverul

Via [Hetzner Cloud Console](https://console.hetzner.cloud/):

1. **New server** → tip **CX33** (4 vCPU, 8 GB RAM — verifică denumirea
   curentă în consolă, Hetzner redenumește ocazional tipurile).
2. **Location**: Nürnberg, Falkenstein sau Helsinki (UE — cerința GDPR din
   `docs/architecture.md`).
3. **Image**: Ubuntu 24.04 LTS.
4. **SSH key**: adaugă cheia ta publică (`~/.ssh/id_ed25519.pub` sau
   echivalent) — **nu** activa autentificare prin parolă.
5. **Firewall** (Hetzner Cloud Firewall, atașat la creare sau imediat
   după): permite doar
   - `22/tcp` (SSH) — ideal restricționat la IP-ul tău, nu `0.0.0.0/0`
   - `80/tcp`, `443/tcp` (HTTP/HTTPS, pentru Caddy)
   - Postgres (`5432`) **nu** trebuie expus niciodată în firewall-ul
     public — rămâne strict pe rețeaua internă Docker.

Alternativ, cu `hcloud` CLI (după `hcloud context create`):

```bash
hcloud server create \
  --type cx33 \
  --location nbg1 \
  --image ubuntu-24.04 \
  --ssh-key <numele-cheii-tale> \
  --name nexero-prod
```

## 2. Configurare inițială server (hardening minim)

Conectează-te ca `root` prima dată, apoi:

```bash
# User non-root, cu sudo
adduser deploy
usermod -aG sudo deploy

# Copiază cheia SSH la noul user
rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy

# Dezactivează login root + autentificare prin parolă pe SSH
# (editează /etc/ssh/sshd_config: PermitRootLogin no, PasswordAuthentication no)
sudo systemctl restart sshd

# Actualizări automate de securitate
sudo apt update && sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades

# Firewall la nivel de OS, ca strat suplimentar peste Hetzner Cloud Firewall
sudo apt install -y ufw
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

De aici încolo, conectează-te ca `deploy`, nu `root`.

## 3. Instalează Docker

Metoda oficială (apt repo Docker, nu scriptul `get.docker.com` — mai
verificabil pentru un server de producție):

```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Rulează docker fără sudo (relogare necesară după asta)
sudo usermod -aG docker deploy
```

Verifică: `docker compose version` (comanda modernă, `docker compose`, nu
`docker-compose` separat — la fel ca în dev, vezi `docker-compose.yml`).

## 4. DNS

Înainte de pornire, configurează un A record pentru domeniul/subdomeniul
API-ului (ex: `api.nexero.ro`) către IP-ul public al serverului. Caddy are
nevoie de DNS propagat ca să obțină certificatul TLS automat la prima
pornire.

## 5. Codul pe server

```bash
git clone https://github.com/<org>/<repo>.git nexero
cd nexero
```

(Momentan `.github/workflows/ci.yml` rulează doar lint + build — deploy
automat din CI, spre acest server, e un pas separat, netratat aici,
per cerința explicită de a documenta, nu executa/automatiza încă.)

## 6. Variabile de mediu de producție

```bash
cp .env.production.example .env
chmod 600 .env
nano .env   # completează valorile reale — vezi comentariile din fișier
```

**Niciodată** valorile din `.env.example` (dev) în producție — `JWT_SECRET`
și parola Postgres trebuie generate propriu:

```bash
openssl rand -hex 32   # pentru JWT_SECRET
openssl rand -hex 24   # pentru POSTGRES_PASSWORD
```

`STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` — cheile **live** din
dashboard Stripe (nu `sk_test_.../whsec_...` de dev), plus un webhook
endpoint configurat în Stripe către `https://<domeniul-tau>/webhooks/stripe`.

## 7. Caddyfile

```bash
cp Caddyfile.example Caddyfile
nano Caddyfile   # înlocuiește api.exemplul-tau.ro cu domeniul real
```

## 8. Build & pornire

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

La pornirea containerului `app`, `docker-entrypoint.sh` rulează automat
`npx prisma migrate deploy` (aplică migrațiile existente, **nu**
`migrate dev` — niciodată generare de migrări noi în producție, doar
aplicarea celor deja commise, per convenția din CLAUDE.md) înainte de a
porni `node dist/main.js`.

Prima pornire a lui Caddy poate dura câteva secunde în plus — obține
certificatul TLS de la Let's Encrypt, are nevoie de DNS deja propagat
(pasul 4).

## 9. Verificare

```bash
curl -I https://<domeniul-tau>/
```

Așteaptă `200`, certificat valid (nu `-k`/`--insecure`). Verifică și
loguri: `docker compose -f docker-compose.prod.yml logs -f app`.

## 10. Actualizări ulterioare

```bash
cd nexero
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

Migrațiile noi (dacă există) se aplică automat la pornirea containerului
`app` (același entrypoint ca la deploy-ul inițial).

## Troubleshooting

**`npm ci` eșuează în build cu `UNABLE_TO_VERIFY_LEAF_SIGNATURE` /
`unable to verify the first certificate`** — nu ține de `Dockerfile`.
Verificat direct (`docker build .`): pe o mașină Windows cu antivirus/proxy
corporate care face inspecție TLS, **orice** apel HTTPS dintr-un container
Docker eșuează la fel (certificatul injectat de software-ul de securitate
la nivelul Windows-ului gazdă nu există în trust store-ul containerului
Linux). Nu apare pe un VPS Hetzner curat, cu acces direct la internet — și
nu apare nici local dacă rulezi `npm ci` direct pe host (în afara Docker),
exact cum s-a văzut de zeci de ori în restul acestei sesiuni. Dacă totuși
apare pe un mediu de build restricționat similar, construiește imaginea
direct pe server (unde oricum se face deploy-ul), nu local.

## Ce rămâne netratat aici (semnalat explicit, nu ignorat tăcut)

- **Backup Postgres** — `docs/architecture.md` nu fixează încă o strategie.
  Minim recomandat până la o decizie mai elaborată: cron zilnic cu
  `docker compose exec postgres pg_dump` către un bucket extern (ex.
  Cloudflare R2, deja în stack pentru storage de fișiere). Nu implementat
  în acest runbook.
- **Monitorizare/alerting** — nefixat în `docs/architecture.md`. Minim
  disponibil azi: `docker compose logs`, `journalctl -u docker`. Un stack
  dedicat (Sentry, Uptime Kuma etc.) e o decizie separată, de luat
  explicit, nu de inventat aici.
- **Deploy automat din CI/CD** — `.github/workflows/ci.yml` face doar
  lint + build. Un job de deploy (SSH + `git pull` + `up -d --build`, sau
  un flux cu registry de imagini) e pas ulterior, cerut explicit separat.
- **Reverse proxy = Caddy** — vezi nota de la începutul documentului;
  confirmă explicit înainte să devină decizie fixată în
  `docs/architecture.md`.
