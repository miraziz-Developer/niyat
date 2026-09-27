#!/bin/sh
# Restores a backup made by backup.sh. Destroys current data, so it asks for confirmation.
#   ./scripts/restore.sh .local/backups/niyat-20260927T031500Z.dump
#   DATABASE_URL=postgresql://owner@host/db NIYAT_APP_DB_PASSWORD=... ./scripts/restore.sh FILE [--yes]
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT"
FILE=${1:-}
[ -n "$FILE" ] && [ -f "$FILE" ] || { echo "Usage: $0 BACKUP_FILE [--yes]" >&2; exit 1; }

if [ "${2:-}" != "--yes" ]; then
  printf 'This replaces ALL current NIYAT data with %s. Type RESTORE to continue: ' "$FILE"
  read -r answer
  [ "$answer" = "RESTORE" ] || { echo "Cancelled."; exit 1; }
fi

if [ -n "${DATABASE_URL:-}" ]; then
  pg_restore --clean --if-exists --no-owner --no-acl --single-transaction --dbname "$DATABASE_URL" "$FILE"
  # Grants were skipped (--no-acl); re-provision them for the runtime role.
  npm run -s db:provision-role
else
  echo "Stopping the API during restore..."
  docker compose stop api
  docker compose exec -T postgres sh -c 'pg_restore --clean --if-exists --no-owner --no-acl --single-transaction -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < "$FILE"
  docker compose run --rm -T migrate </dev/null
  docker compose start api
fi
echo "Restore complete from $FILE"
