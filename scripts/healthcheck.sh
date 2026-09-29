#!/bin/sh
# Checks the running NIYAT stack and emails NIYAT_ALERT_EMAIL (default NIYAT_ADMIN_EMAIL) through Resend
# when something breaks, every NIYAT_ALERT_REPEAT_HOURS (default 6) while it stays broken, and once on recovery.
# Checks: /v1/ready locally and over HTTPS, API 5xx responses in the last 5 minutes, disk use,
# age of the newest backup and failed off-site copies. Exit status 1 while there is a problem.
# server-up.sh schedules it: */5 * * * * cd /srv/niyat && ./scripts/healthcheck.sh >> .local/health.log 2>&1
#   ./scripts/healthcheck.sh           check and alert
#   ./scripts/healthcheck.sh --test    send a test alert to confirm email delivery
set -u

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT"
env_value() { sed -n "s/^$1=//p" .env 2>/dev/null | tail -n 1 | sed 's/^"\(.*\)"$/\1/'; }
setting() { eval "value=\${$1:-}"; [ -n "$value" ] || value=$(env_value "$1"); printf '%s' "${value:-$2}"; }

DOMAIN=$(setting NIYAT_DOMAIN '')
PORT=$(setting NIYAT_HTTP_PORT 8080)
KEY=$(setting RESEND_API_KEY '')
FROM=$(setting MAIL_FROM '')
TO=$(setting NIYAT_ALERT_EMAIL "$(setting NIYAT_ADMIN_EMAIL '')")
MAX_ERRORS=$(setting NIYAT_ALERT_5XX 5)
MAX_DISK=$(setting NIYAT_ALERT_DISK_PERCENT 90)
REPEAT_HOURS=$(setting NIYAT_ALERT_REPEAT_HOURS 6)
RESEND_URL=$(setting NIYAT_RESEND_URL https://api.resend.com/emails)
BACKUPS=.local/backups
STATE=.local/health.state
HOST=${DOMAIN:-$(hostname)}
NOW=$(date +%s)

json_string() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g' | awk 'BEGIN { ORS = "" } { if (NR > 1) printf "\\n"; print }'; }

send() {
  subject=$1; body=$2
  if [ -z "$KEY" ] || [ -z "$TO" ] || [ -z "$FROM" ]; then
    echo "[alert] $subject (email is not configured: RESEND_API_KEY, MAIL_FROM and NIYAT_ALERT_EMAIL/NIYAT_ADMIN_EMAIL)"
    return 1
  fi
  payload="{\"from\":\"$(json_string "$FROM")\",\"to\":[\"$(json_string "$TO")\"],\"subject\":\"$(json_string "$subject")\",\"text\":\"$(json_string "$body")\"}"
  if curl -fsS --max-time 20 "$RESEND_URL" -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' -d "$payload" >/dev/null; then
    echo "[alert] sent to $TO: $subject"
  else
    echo "[alert] sending failed: $subject"
    return 1
  fi
}

if [ "${1:-}" = --test ]; then
  send "NIYAT: sinov ogohlantirishi ($HOST)" "Bu sinov xati. Muammo chiqsa shu manzilga ogohlantirish keladi."
  exit $?
fi

compose() { if docker info >/dev/null 2>&1; then docker compose "$@"; else sudo -n docker compose "$@"; fi; }

problems=""
add() { problems="${problems}- $1
"; }

curl -fsS --max-time 10 "http://127.0.0.1:$PORT/v1/ready" >/dev/null 2>&1 \
  || add "API yoki database javob bermayapti (http://127.0.0.1:$PORT/v1/ready). Tekshirish: docker compose ps; docker compose logs --tail=100 api postgres"
if [ -n "$DOMAIN" ]; then
  curl -fsS --max-time 15 "https://$DOMAIN/v1/ready" >/dev/null 2>&1 \
    || add "https://$DOMAIN ochilmayapti (HTTPS, sertifikat yoki Caddy). Tekshirish: docker compose logs --tail=100 caddy"
fi

errors=$(compose logs --since 5m api 2>/dev/null | grep -c '"level":"error"')
[ "${errors:-0}" -lt "$MAX_ERRORS" ] \
  || add "So'nggi 5 daqiqada $errors ta server xatosi (5xx). Tekshirish: docker compose logs --since 10m api | grep error"

disk=$(df -P . | awk 'NR == 2 { gsub("%", "", $5); print $5 }')
[ "${disk:-0}" -lt "$MAX_DISK" ] || add "Disk ${disk}% to'lgan. Eski image'larni tozalash: docker image prune -f"

# Backups are scheduled in domain mode; a missing or stale one means the cron job is failing.
if [ -n "$DOMAIN" ] && [ -f "$BACKUPS/backup.log" ]; then
  find "$BACKUPS" -name 'niyat-*.dump' -mmin -1560 2>/dev/null | grep -q . \
    || add "Oxirgi 26 soatda backup olinmagan. Log: $BACKUPS/backup.log"
fi
[ ! -f "$BACKUPS/remote-failed" ] || add "Backup'ni serverdan tashqariga ko'chirish muvaffaqiyatsiz ($(cat "$BACKUPS/remote-failed")). Log: $BACKUPS/backup.log"

previous=ok; sent_at=0
[ -f "$STATE" ] && read -r previous sent_at < "$STATE"
current=ok; [ -z "$problems" ] || current=$(printf '%s' "$problems" | cksum | cut -d' ' -f1)

if [ "$current" = ok ]; then
  if [ "$previous" != ok ]; then
    send "NIYAT: tiklandi ($HOST)" "Hamma tekshiruvlar yana o'tmoqda. $(date -u '+%Y-%m-%d %H:%M UTC')"
  fi
  echo "ok 0" > "$STATE"
  exit 0
fi

printf '%s %s\n' "$(date -u +%FT%TZ)" "$(printf '%s' "$problems" | tr '\n' ' ')"
if [ "$current" != "$previous" ] || [ $((NOW - ${sent_at:-0})) -ge $((REPEAT_HOURS * 3600)) ]; then
  send "NIYAT: muammo ($HOST)" "$(date -u '+%Y-%m-%d %H:%M UTC') holatida:

$problems
Yo'riqnoma: DEPLOY.md, \"Muammolar\" va \"Xavfsizlik hodisasi\" bo'limlari." && sent_at=$NOW
fi
echo "$current ${sent_at:-0}" > "$STATE"
exit 1
