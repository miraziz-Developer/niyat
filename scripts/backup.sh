#!/bin/sh
# Creates a verified, compressed PostgreSQL backup and keeps the newest NIYAT_BACKUP_KEEP (default 14).
#   ./scripts/backup.sh                      Docker stack (docker compose exec postgres)
#   DATABASE_URL=postgresql://... ./scripts/backup.sh   any reachable database, using local pg_dump
# Schedule daily, e.g. cron: 15 3 * * * cd /srv/niyat && ./scripts/backup.sh >> .local/backups/backup.log 2>&1
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT"
DIR=${NIYAT_BACKUP_DIR:-.local/backups}
KEEP=${NIYAT_BACKUP_KEEP:-$(sed -n 's/^NIYAT_BACKUP_KEEP=//p' .env 2>/dev/null | tail -n 1)}
KEEP=${KEEP:-14}
mkdir -p "$DIR"
chmod 700 "$DIR"
FILE="$DIR/niyat-$(date -u +%Y%m%dT%H%M%SZ).dump"
umask 077

if [ -n "${DATABASE_URL:-}" ]; then
  pg_dump --format=custom --no-owner "$DATABASE_URL" > "$FILE.partial"
  pg_restore --list "$FILE.partial" > /dev/null
else
  docker compose exec -T postgres sh -c 'pg_dump --format=custom --no-owner -U "$POSTGRES_USER" "$POSTGRES_DB"' > "$FILE.partial"
  docker compose exec -T postgres pg_restore --list < "$FILE.partial" > /dev/null
fi

# Only a dump that pg_restore can read replaces the partial name.
mv "$FILE.partial" "$FILE"
echo "Backup ready: $FILE ($(wc -c < "$FILE") bytes)"

ls -1t "$DIR"/niyat-*.dump 2>/dev/null | tail -n +$((KEEP + 1)) | while read -r old; do rm -f "$old"; echo "Pruned $old"; done
