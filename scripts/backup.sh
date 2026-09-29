#!/bin/sh
# Creates a verified, compressed PostgreSQL backup and keeps the newest NIYAT_BACKUP_KEEP (default 14).
# With NIYAT_BACKUP_REMOTE (an rclone remote such as b2:niyat-backups) each backup is also copied
# off the server and remote copies older than NIYAT_BACKUP_REMOTE_DAYS (default 30) are pruned.
#   ./scripts/backup.sh                      Docker stack (docker compose exec postgres)
#   DATABASE_URL=postgresql://... ./scripts/backup.sh   any reachable database, using local pg_dump
# server-up.sh schedules it daily: 15 3 * * * cd /srv/niyat && ./scripts/backup.sh >> .local/backups/backup.log 2>&1
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT"
# cron runs without the .env values in its environment.
env_value() { sed -n "s/^$1=//p" .env 2>/dev/null | tail -n 1 | sed 's/^"\(.*\)"$/\1/'; }
DIR=${NIYAT_BACKUP_DIR:-.local/backups}
KEEP=${NIYAT_BACKUP_KEEP:-$(env_value NIYAT_BACKUP_KEEP)}
KEEP=${KEEP:-14}
REMOTE=${NIYAT_BACKUP_REMOTE:-$(env_value NIYAT_BACKUP_REMOTE)}
REMOTE_DAYS=${NIYAT_BACKUP_REMOTE_DAYS:-$(env_value NIYAT_BACKUP_REMOTE_DAYS)}
REMOTE_DAYS=${REMOTE_DAYS:-30}
mkdir -p "$DIR"
chmod 700 "$DIR"
DIR=$(CDPATH= cd -- "$DIR" && pwd)
NAME="niyat-$(date -u +%Y%m%dT%H%M%SZ).dump"
FILE="$DIR/$NAME"
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

[ -n "$REMOTE" ] || exit 0

# Host rclone when installed, otherwise the official image with the host's rclone config.
rclone_run() {
  if command -v rclone >/dev/null 2>&1; then (cd "$DIR" && rclone "$@")
  else
    docker run --rm -v "${RCLONE_CONFIG_DIR:-$HOME/.config/rclone}:/config/rclone" -v "$DIR:/data" -w /data \
      "${NIYAT_RCLONE_IMAGE:-rclone/rclone:1}" "$@"
  fi
}

# The marker lets healthcheck.sh alert when copies stop leaving the server.
if rclone_run copyto "$NAME" "$REMOTE/$NAME" && rclone_run delete --min-age "${REMOTE_DAYS}d" --include 'niyat-*.dump' "$REMOTE"; then
  rm -f "$DIR/remote-failed"
  echo "Copied off-site: $REMOTE/$NAME"
else
  date -u +%Y-%m-%dT%H:%M:%SZ > "$DIR/remote-failed"
  echo "Off-site copy to $REMOTE failed; the local backup is kept." >&2
  exit 1
fi
