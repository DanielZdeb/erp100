# Deploy ERP na Hetzner CCX13 + Coolify

Krok-po-kroku runbook. **Czas: ~90 min** pierwszy raz, potem deploy = `git push`.

> **Podmień `erp100.pl` w całym pliku na swoją domenę** zanim zaczniesz.

---

## 0. Co zostało już przygotowane w repo

Te pliki już są — nic nie ruszaj, są częścią deploya:

- `next.config.ts` — `output: "standalone"` (Docker image ~150 MB)
- `Dockerfile` — 3-stage build (deps → builder → runner, non-root user)
- `.dockerignore` — wyklucza node_modules, .next, uploads, secrets
- `.env.production.example` — szablon zmiennych (skopiuj wartości do Coolify UI)
- `scripts/migrate-to-hetzner.sh` — pg_dump → restore w kontenerze + instrukcja rsync

Zostawiamy `/uploads/` lokalnie na VPS (244 MB, Coolify Persistent Storage).

---

## 1. Zakup VPS na Hetzner

1. Załóż konto: <https://accounts.hetzner.com/signUp>
2. Hetzner Cloud → Add Server:
   - **Lokalizacja:** Falkenstein (Niemcy, najbliżej PL ~20 ms latencja)
   - **Image:** Ubuntu 24.04
   - **Type:** CCX13 — dedicated AMD vCPU 2c, 8 GB RAM, 80 GB NVMe — **€14,51/mies.**
   - **Network:** zostaw default (publiczny IPv4 + IPv6)
   - **SSH Keys:** dodaj swój publiczny klucz (`~/.ssh/id_ed25519.pub` z Twojego Windowsa).
     Bez tego dostaniesz hasło rootem na maila — gorzej, ale działa.
   - **Name:** np. `erp-acro4f`
3. Create & buy now → poczekaj 10 s aż wstanie
4. Zapisz **IPv4** serwera, np. `1.2.3.4`

---

## 2. Hardening + Coolify install

SSH na serwer:

```bash
ssh root@1.2.3.4
```

### 2a. Update + firewall

```bash
apt update && apt upgrade -y
apt install -y ufw fail2ban

# Firewall: 22 (SSH), 80 + 443 (HTTP/S), 8000 (Coolify UI tymczasowo)
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 8000/tcp
ufw --force enable

# fail2ban automatycznie chroni SSH przed brute-force
systemctl enable --now fail2ban
```

### 2b. Coolify install (1 komenda)

```bash
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
```

Czeka 3-5 min, instaluje Docker + Coolify + Traefik (reverse proxy + SSL).
Na końcu wyświetli URL panelu admina, np. `http://1.2.3.4:8000`.

Otwórz w przeglądarce. Pierwsze logowanie:
- Załóż konto admin (email + hasło → zapisz w menedżerze haseł)
- W ustawieniach: **General → Instance Domain** — wpisz tymczasowo IP albo subdomenę
  (np. `coolify.erp100.pl` jak chcesz panel pod URL, ale to opcjonalne)

---

## 3. DNS — wskazanie domeny na VPS

W panelu rejestratora domeny (OVH, home.pl, Nazwa.pl, itp.) dodaj rekord A:

```
erp100.pl       A       1.2.3.4    TTL 300
www.erp100.pl   A       1.2.3.4    TTL 300
```

Sprawdź propagację (max 15 min):

```bash
dig erp100.pl +short
# powinno zwrócić 1.2.3.4
```

---

## 4. Coolify: utworzenie Postgres service

W Coolify panel:

1. **Projects → New Project** → nazwa: `erp-acro4f`
2. W projekcie: **+ New Resource → Database → PostgreSQL** → wersja 16
3. Konfig:
   - **Name:** `postgres-erp`
   - **Database Name:** `erp`
   - **Username:** `erp`
   - **Password:** *Coolify wygeneruje silne, ZAPISZ do menedżera haseł!*
4. Start → poczekaj aż status = Running

Po starcie w **Details** zobaczysz:
- **Internal Connection String** — coś jak `postgresql://erp:HASLO@postgres-erp-xxxxx:5432/erp` —
  TEN string pójdzie do `DATABASE_URL` aplikacji
- **Container Name** — np. `postgres-erp-xxxxx` — zapisz, użyjesz w skrypcie migracji

---

## 5. Coolify: utworzenie Application

1. W tym samym projekcie: **+ New Resource → Application → Public Repository** *(lub Private jak masz repo prywatne — wtedy GitHub App)*
2. **Repository URL:** Twoje URL GitHub repo (np. `https://github.com/DanielZdeb/...`)
3. **Branch:** `main`
4. **Build Pack:** `Dockerfile` (Coolify wykryje sam, że jest `Dockerfile` w root)
5. **Base directory:** `/erp-firma` ← **UWAGA:** Twoje repo zawiera wiele projektów, ERP siedzi w `erp-firma/`. Musisz to wskazać.

   *Wskazówka:* jeśli Coolify nie obsługuje subfolderu na build, alternatywnie zrób nowe repo tylko z `erp-firma/` (zalecane).

6. **Domain:** `https://erp100.pl` (Coolify automatycznie wystawi Let's Encrypt SSL)
7. **Port:** `3000`

### 5a. Environment Variables

Skopiuj z `.env.production.example` i wypełnij:

| Klucz | Wartość |
|---|---|
| `DATABASE_URL` | Internal Connection String z kroku 4 |
| `DIRECT_URL` | To samo co `DATABASE_URL` |
| `AUTH_SECRET` | wygeneruj na lokalu: `openssl rand -base64 32` |
| `AUTH_URL` | `https://erp100.pl` |
| `BLOB_READ_WRITE_TOKEN` | *zostaw pusty — wymusza fallback na local /uploads/* |
| `ANTHROPIC_API_KEY` | (opcjonalnie — Twój klucz z console.anthropic.com) |
| `GEMINI_API_KEY` | (opcjonalnie) |
| `NODE_ENV` | `production` |
| `PORT` | `3000` |
| `HOSTNAME` | `0.0.0.0` |

### 5b. Persistent Storage dla /uploads/

**Application → Storages → + Add:**
- **Type:** Volume Mount
- **Source Path:** `/data/coolify/applications/{APP_ID}/uploads` (Coolify podpowie)
- **Destination Path in Container:** `/app/public/uploads`

Bez tego: każdy redeploy = utracone uploady. Z tym: pliki są poza kontenerem, przeżywają deploy.

### 5c. Deploy

Kliknij **Deploy**. Coolify:
1. Klonuje repo
2. Buduje Dockerfile (~5 min pierwszy raz, ~2 min kolejne — cache warstw)
3. Startuje kontener
4. Traefik podstawia SSL i pod domenę

Sprawdź **Logs** zakładkę jak coś nie wstaje. Jak `Ready in 280ms` — działa.

---

## 6. Pierwsza migracja schema (na pustej bazie)

Po pierwszym deployu Coolify nie odpalił `prisma migrate deploy` — zrób to ręcznie z lokalu:

```bash
# Z lokalu, mając VPS Postgres tunelowany na localhost lub bezpośredni connection
# Najprościej: wejdź do kontenera Coolify i odpal migracje stamtąd.

ssh root@1.2.3.4
docker exec -it $(docker ps -q -f name=erp-firma) sh
# wewnątrz kontenera:
npx prisma migrate deploy
exit
```

*Alternatywa:* dodaj do Dockerfile na końcu `CMD`:
```dockerfile
CMD ["sh", "-c", "npx prisma migrate deploy && node server.js"]
```
…jeśli wolisz automatyczne migracje przy każdym deployu (idempotentne).

---

## 7. Migracja danych z lokalu na Hetzner

Lokalnie (Git Bash / WSL na Twoim Windowsie):

```bash
cd "c:/Users/zdebd/projekty-zdeb/GitHub/API KRS/erp-firma"

# Zmienne — podstaw swoje:
export VPS_HOST=root@1.2.3.4
export VPS_POSTGRES_CONTAINER=postgres-erp-xxxxx      # z kroku 4
export VPS_POSTGRES_DB=erp
export VPS_POSTGRES_USER=erp

chmod +x scripts/migrate-to-hetzner.sh
./scripts/migrate-to-hetzner.sh
```

Skrypt zrobi:
1. `pg_dump` lokalnej DB → `erp-dump-DATA.sql.gz`
2. `scp` na VPS do `/tmp/`
3. `docker cp` → kontener Postgresa
4. `psql < dump` → odzyskujesz wszystkie dane

Następnie ręcznie zsynchronizuj `/uploads/`:

```bash
# Sprawdź ścieżkę volume w Coolify (Application → Storages)
rsync -avzP --delete public/uploads/ \
  root@1.2.3.4:/data/coolify/applications/APP_ID/uploads/

# Po sync — chown na non-root user w kontenerze (UID 1001 = nextjs w naszym Dockerfile)
ssh root@1.2.3.4 \
  "chown -R 1001:1001 /data/coolify/applications/APP_ID/uploads"
```

---

## 8. Smoke test

1. Otwórz `https://erp100.pl`
2. Zaloguj się — sprawdź czy widzisz produkty/zamówienia
3. Otwórz kartę produktu — sprawdź czy zdjęcia się ładują
4. Upload nowego zdjęcia → sprawdź w `/data/coolify/applications/APP_ID/uploads/` czy pojawił się plik
5. Stwórz testowe zamówienie → wygeneruj PDF (sprawdza czy `@react-pdf/renderer` + fonty działają w kontenerze)

---

## 9. Backups (zalecane od dnia 0)

W Coolify → `postgres-erp` service → **Backups**:
- Włącz: **Automatic Backup**
- **Schedule:** `0 3 * * *` (codziennie 3:00)
- **S3 destination:** dodaj **Cloudflare R2** (10 GB darmowe) albo **Backblaze B2**
- **Retention:** 14 dni

Backupy `/uploads/`:

```bash
# Cron na VPS, codziennie 4:00 — tar + upload do tego samego R2 bucketu
crontab -e
# dodaj:
0 4 * * * tar czf /tmp/uploads-$(date +\%Y\%m\%d).tar.gz /data/coolify/applications/APP_ID/uploads/ && rclone copy /tmp/uploads-*.tar.gz r2:erp-backups/ && rm /tmp/uploads-*.tar.gz
```

(rclone config z R2 — osobny temat, mogę pomóc.)

---

## 10. Cloudflare przed VPS (opcjonalnie — darmowy boost)

Jeśli dodasz Cloudflare jako proxy DNS:
- Darmowe DDoS protection
- Cache `/uploads/*` na PoP-ach blisko klientów (Warszawa, Berlin, Kraków)
- Brotli + HTTP/3 out-of-the-box
- Ukrywasz IP serwera

Setup: w panelu rejestratora zmień nameservery na Cloudflare. W CF panel: ustaw rekord A na IP VPS, **Proxy status: Proxied (pomarańczowa chmurka)**. Konfig SSL: **Full (strict)** — Cloudflare ↔ Hetzner przez Let's Encrypt cert który Coolify już wystawił.

---

## Deploy po raz pierwszy zrobione. Kolejne deploye:

```bash
git add . && git commit -m "..." && git push origin main
```

Coolify wykrywa push, buduje, deployuje. ~2 min. Bez downtime (Traefik przełącza ruch po healthcheck na nowy kontener).

---

## Rollback

W Coolify → Application → **Deployments** → wybierz poprzedni → **Redeploy**.
Postgres rollback: backup z R2 → restore przez `psql` jak w kroku 7.

---

## Koszty miesięczne

| Pozycja | Koszt |
|---|---|
| Hetzner CCX13 | €14,51 |
| Domena (jak nie masz) | ~€3 amortyzowane / mies. |
| Cloudflare DNS + CDN | **€0** |
| R2 backups (10 GB) | **€0** |
| Anthropic API (opcjonalnie) | pay-as-you-go |
| Gemini API (opcjonalnie) | pay-as-you-go |
| **Razem** | **~€18 / mies.** |

vs Vercel + Neon + Vercel Blob: ~$30-50/mies. + ryzyko surprise billing przy spikes ruchu.
