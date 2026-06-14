#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════
# Migracja: lokalny Postgres + /uploads/  →  Hetzner VPS (Coolify)
# ════════════════════════════════════════════════════════════════
#
# WYMAGA wcześniej:
#   1. Hetzner CCX13 wystawiony, Coolify zainstalowany
#   2. Coolify utworzony Postgres service (zapamiętaj DB name + user + password)
#   3. Coolify utworzony Application z repo + wystawiona domena
#   4. Domain wskazuje na IP VPS (A record), SSL już aktywny
#   5. Aplikacja przynajmniej raz wstała (puste migracje uruchomione)
#
# ZRÓB w terminalu na swoim Windowsie (Git Bash / WSL):
#   chmod +x scripts/migrate-to-hetzner.sh
#   VPS_HOST=root@TWOJE_IP_HETZNER \
#   VPS_POSTGRES_CONTAINER=postgres-erp-xxxxx \
#   VPS_POSTGRES_DB=erp \
#   VPS_POSTGRES_USER=erp \
#   ./scripts/migrate-to-hetzner.sh

set -euo pipefail

LOCAL_DB_URL="${LOCAL_DATABASE_URL:-}"
if [ -z "$LOCAL_DB_URL" ]; then
  # Wczytaj z .env (DATABASE_URL=postgres://...)
  if [ -f .env ]; then
    LOCAL_DB_URL=$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
  fi
fi
if [ -z "$LOCAL_DB_URL" ]; then
  echo "✗ Brak DATABASE_URL w .env. Ustaw LOCAL_DATABASE_URL=..."
  exit 1
fi

: "${VPS_HOST:?VPS_HOST wymagany (np. root@1.2.3.4)}"
: "${VPS_POSTGRES_CONTAINER:?VPS_POSTGRES_CONTAINER wymagany}"
: "${VPS_POSTGRES_DB:?VPS_POSTGRES_DB wymagany}"
: "${VPS_POSTGRES_USER:?VPS_POSTGRES_USER wymagany}"

DUMP_FILE="erp-dump-$(date +%Y%m%d-%H%M%S).sql.gz"

echo "═══════════════════════════════════════════════════════════"
echo "Migracja ERP → Hetzner"
echo "═══════════════════════════════════════════════════════════"
echo "  Local DB:    ${LOCAL_DB_URL%@*}@***"
echo "  VPS host:    $VPS_HOST"
echo "  VPS PG ctr:  $VPS_POSTGRES_CONTAINER"
echo "  VPS DB:      $VPS_POSTGRES_DB (user: $VPS_POSTGRES_USER)"
echo "  Dump file:   $DUMP_FILE"
echo

# ─── 1. Dump lokalnej bazy ─────────────────────────────────
echo "─── 1/4: pg_dump lokalnej bazy ──────────────────────────"
# --clean usuwa istniejące obiekty przed restore (idempotentne)
# --if-exists = nie krzyczy gdy DB jest pusta
# --no-owner / --no-privileges = nie przenosi ról (Coolify ma własne usery)
pg_dump "$LOCAL_DB_URL" \
  --clean --if-exists --no-owner --no-privileges \
  | gzip -9 > "$DUMP_FILE"
ls -lh "$DUMP_FILE"
echo

# ─── 2. Wgranie dumpa na VPS ───────────────────────────────
echo "─── 2/4: scp dump na VPS ────────────────────────────────"
scp "$DUMP_FILE" "$VPS_HOST:/tmp/$DUMP_FILE"
echo "  → /tmp/$DUMP_FILE na $VPS_HOST"
echo

# ─── 3. Restore w kontenerze Postgresa ─────────────────────
echo "─── 3/4: restore w kontenerze Postgresa ────────────────"
ssh "$VPS_HOST" "bash -s" << EOF
set -e
echo "  Kopiuję dump do kontenera..."
docker cp "/tmp/$DUMP_FILE" "${VPS_POSTGRES_CONTAINER}:/tmp/$DUMP_FILE"
echo "  Restoring..."
docker exec -i "${VPS_POSTGRES_CONTAINER}" bash -c \
  "gunzip -c /tmp/$DUMP_FILE | psql -U ${VPS_POSTGRES_USER} -d ${VPS_POSTGRES_DB}"
echo "  Sprzątam tmp..."
docker exec "${VPS_POSTGRES_CONTAINER}" rm -f "/tmp/$DUMP_FILE"
rm -f "/tmp/$DUMP_FILE"
echo "  ✓ Restore OK"
EOF
echo

# ─── 4. Sync /uploads/ przez rsync ─────────────────────────
echo "─── 4/4: rsync public/uploads/ → VPS ───────────────────"
echo "  UWAGA: ta operacja kopiuje 244 MB plików (~5 min na słabym łączu)."
echo "  Cel na VPS to volume zarządzany przez Coolify — sprawdź w runbook"
echo "  ścieżkę dla TWOJEJ aplikacji (Coolify → Application → Storage)."
echo
echo "  Przykładowa komenda do uruchomienia ręcznie:"
echo
echo "    rsync -avzP --delete public/uploads/ \\"
echo "      $VPS_HOST:/data/coolify/applications/APP_ID/uploads/"
echo
echo "  Po tym chown na VPS:"
echo "    ssh $VPS_HOST 'chown -R 1001:1001 /data/coolify/applications/APP_ID/uploads'"
echo

# ─── Posprzątaj ────────────────────────────────────────────
echo "═══════════════════════════════════════════════════════════"
echo "Lokalny dump: $DUMP_FILE — zachowaj jako backup."
echo "Zalogowuje się do nowej aplikacji, sprawdź czy widzi dane."
echo "═══════════════════════════════════════════════════════════"
