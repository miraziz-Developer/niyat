#!/bin/sh
# NIYAT — bitta buyruq bilan serverga o'rnatish va yangilash. Qayta ishga tushirish xavfsiz (idempotent).
#
#   Sinov (domensiz, http://SERVER_IP:8080, demo foydalanuvchi bilan):
#     ./scripts/server-up.sh
#
#   Haqiqiy ishga tushirish (HTTPS + taklif asosidagi email kirish):
#     ./scripts/server-up.sh --domain niyat.uz --email siz@gmail.com --resend-key re_xxx
#
#   Yangilash:  git pull && ./scripts/server-up.sh
#   Faqat .env tayyorlash (Docker'siz):  ./scripts/server-up.sh --env-only ...
#
# Batafsil: DEPLOY.md
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT"

say() { printf '\n\033[1;32m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[!]\033[0m %s\n' "$*" >&2; }
die() { printf '\033[1;31m[x]\033[0m %s\n' "$*" >&2; exit 1; }

usage() {
  sed -n '2,14p' "$0" | sed 's/^# \{0,1\}//'
  cat <<'EOF'

Parametrlar (yoki shu nomdagi muhit o'zgaruvchilari):
  --domain DOMEN          NIYAT_DOMAIN       HTTPS va email kirishni yoqadi (DNS A-yozuvi shu serverga qarashi kerak)
  --email EMAIL           NIYAT_ADMIN_EMAIL  Birinchi taklif qilinadigan admin emaili
  --resend-key KALIT      RESEND_API_KEY     Xat yuborish (resend.com). Bo'lmasa havolalar API logiga chiqadi
  --mail-from "N <a@d>"   MAIL_FROM          Xat jo'natuvchisi (default: NIYAT <kirish@DOMEN>)
  --contact EMAIL         VITE_CONTACT_EMAIL Maxfiylik sahifasidagi aloqa emaili (default: admin emaili)
  --env-only              Faqat .env ni yozib chiqadi, Docker'ga tegmaydi
  -h, --help              Shu yordam
EOF
}

DOMAIN=${NIYAT_DOMAIN:-}
ADMIN_EMAIL=${NIYAT_ADMIN_EMAIL:-}
RESEND_KEY=${RESEND_API_KEY:-}
MAIL_FROM_ARG=${MAIL_FROM:-}
CONTACT=${VITE_CONTACT_EMAIL:-}
ENV_ONLY=0
ARGS_GIVEN=0

while [ $# -gt 0 ]; do
  case "$1" in
    --domain) DOMAIN=${2:?--domain qiymat talab qiladi}; ARGS_GIVEN=1; shift 2 ;;
    --email) ADMIN_EMAIL=${2:?--email qiymat talab qiladi}; ARGS_GIVEN=1; shift 2 ;;
    --resend-key) RESEND_KEY=${2:?--resend-key qiymat talab qiladi}; ARGS_GIVEN=1; shift 2 ;;
    --mail-from) MAIL_FROM_ARG=${2:?--mail-from qiymat talab qiladi}; ARGS_GIVEN=1; shift 2 ;;
    --contact) CONTACT=${2:?--contact qiymat talab qiladi}; ARGS_GIVEN=1; shift 2 ;;
    --env-only) ENV_ONLY=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) usage; die "Noma'lum parametr: $1" ;;
  esac
done

# ---------------------------------------------------------------------------
# .env helpers: values are written as KEY=value (double-quoted when they contain spaces).
# ---------------------------------------------------------------------------
random_secret() {
  if command -v openssl >/dev/null 2>&1; then openssl rand -hex 24
  else od -An -N24 -tx1 /dev/urandom | tr -d ' \n'; fi
}

get_env() {
  [ -f .env ] || return 0
  sed -n "s/^$1=//p" .env | tail -1 | sed 's/^"\(.*\)"$/\1/'
}

set_env() {
  key=$1; value=$2
  case "$value" in *' '*|*'<'*|*'>'*) value="\"$value\"" ;; esac
  tmp=$(mktemp)
  [ -f .env ] && grep -v "^$key=" .env > "$tmp" || true
  printf '%s=%s\n' "$key" "$value" >> "$tmp"
  mv "$tmp" .env
  chmod 600 .env
}

ensure_env() { [ -n "$(get_env "$1")" ] || set_env "$1" "$2"; }

valid_email() { printf '%s' "$1" | grep -Eq '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'; }

# ---------------------------------------------------------------------------
# First run on a terminal without parameters: ask the few questions that matter.
# ---------------------------------------------------------------------------
FIRST_RUN=0
[ -f .env ] || FIRST_RUN=1
if [ "$FIRST_RUN" = 1 ] && [ "$ARGS_GIVEN" = 0 ] && [ -z "$DOMAIN" ] && [ -t 0 ]; then
  say "NIYAT sozlamalari (Enter — o'tkazib yuborish)"
  printf 'Domen (masalan niyat.uz; bo‘sh qoldirsangiz sinov rejimi, http://IP:8080): '; read -r DOMAIN
  if [ -n "$DOMAIN" ]; then
    printf 'Admin emaili (birinchi taklif): '; read -r ADMIN_EMAIL
    printf 'Resend API kaliti (re_...; bo‘sh bo‘lsa havolalar logga chiqadi): '; read -r RESEND_KEY
  fi
fi

DOMAIN=$(printf '%s' "$DOMAIN" | tr 'A-Z' 'a-z' | sed 's#^https\{0,1\}://##; s#[/:].*$##')
[ -z "$DOMAIN" ] || printf '%s' "$DOMAIN" | grep -Eq '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$' \
  || die "Domen noto'g'ri: $DOMAIN (masalan: niyat.example.uz)"
[ -z "$ADMIN_EMAIL" ] || valid_email "$ADMIN_EMAIL" || die "Admin emaili noto'g'ri: $ADMIN_EMAIL"
[ -z "$CONTACT" ] || valid_email "$CONTACT" || die "Aloqa emaili noto'g'ri: $CONTACT"

# ---------------------------------------------------------------------------
# .env
# ---------------------------------------------------------------------------
say ".env tayyorlanmoqda"
[ -f .env ] || { : > .env; chmod 600 .env; echo "Yangi .env yaratildi (parollar tasodifiy)."; }
ensure_env POSTGRES_DB niyat
ensure_env POSTGRES_USER niyat
ensure_env POSTGRES_PASSWORD "$(random_secret)"
ensure_env NIYAT_APP_DB_USER niyat_app
ensure_env NIYAT_APP_DB_PASSWORD "$(random_secret)"
ensure_env DATABASE_POOL_SIZE 10
ensure_env NIYAT_HTTP_PORT 8080
ensure_env NIYAT_POSTGRES_PORT 55432
ensure_env NIYAT_BACKUP_KEEP 14

[ -n "$DOMAIN" ] || DOMAIN=$(get_env NIYAT_DOMAIN)
[ -n "$ADMIN_EMAIL" ] || ADMIN_EMAIL=$(get_env NIYAT_ADMIN_EMAIL)
[ -n "$RESEND_KEY" ] || RESEND_KEY=$(get_env RESEND_API_KEY)

if [ -n "$DOMAIN" ]; then
  # Real launch: HTTPS through Caddy, invite-only magic links, no demo auto-login.
  set_env NIYAT_DOMAIN "$DOMAIN"
  set_env APP_ORIGIN "https://$DOMAIN"
  set_env AUTH_MODE email
  set_env VITE_DEV_USER_ID ""
  set_env COMPOSE_PROFILES https
  set_env NIYAT_HTTP_BIND 127.0.0.1
  [ -z "$ADMIN_EMAIL" ] || set_env NIYAT_ADMIN_EMAIL "$ADMIN_EMAIL"
  [ -n "$MAIL_FROM_ARG" ] && set_env MAIL_FROM "$MAIL_FROM_ARG" || ensure_env MAIL_FROM "NIYAT <kirish@$DOMAIN>"
  if [ -n "$CONTACT" ]; then set_env VITE_CONTACT_EMAIL "$CONTACT"; elif [ -n "$ADMIN_EMAIL" ]; then ensure_env VITE_CONTACT_EMAIL "$ADMIN_EMAIL"; fi
  if [ -n "$RESEND_KEY" ]; then
    set_env RESEND_API_KEY "$RESEND_KEY"
    set_env NIYAT_NODE_ENV production
  else
    # Production refuses to print sign-in links to logs, so without a mail key the API runs in development mode.
    set_env RESEND_API_KEY ""
    set_env NIYAT_NODE_ENV development
    warn "RESEND_API_KEY yo'q: xat yuborilmaydi, kirish havolalari API logiga chiqadi (sinov uchun). Kalit qo'shish: --resend-key re_..."
  fi
else
  # Test mode: plain HTTP on port 8080 and automatic sign-in as the demo member.
  ensure_env AUTH_MODE local
  ensure_env NIYAT_NODE_ENV development
  ensure_env NIYAT_HTTP_BIND 0.0.0.0
  if [ "$(get_env AUTH_MODE)" = local ]; then ensure_env VITE_DEV_USER_ID 00000000-0000-4000-8000-000000000001; fi
fi

if [ "$ENV_ONLY" = 1 ]; then
  say ".env yozildi (--env-only). Docker bosqichlari o'tkazib yuborildi."
  exit 0
fi

# ---------------------------------------------------------------------------
# Docker
# ---------------------------------------------------------------------------
SUDO=""
[ "$(id -u)" = 0 ] || SUDO="sudo"

if ! command -v docker >/dev/null 2>&1; then
  [ "$(uname -s)" = Linux ] || die "Docker topilmadi. Docker Desktop o'rnating: https://docs.docker.com/get-docker/"
  command -v curl >/dev/null 2>&1 || die "Docker'ni o'rnatish uchun curl kerak: $SUDO apt-get install -y curl"
  say "Docker o'rnatilmoqda (rasmiy get.docker.com skripti)"
  curl -fsSL https://get.docker.com | $SUDO sh
fi

DOCKER=docker
if ! docker info >/dev/null 2>&1; then
  if $SUDO docker info >/dev/null 2>&1; then DOCKER="$SUDO docker"
  else
    $SUDO systemctl enable --now docker >/dev/null 2>&1 || true
    if docker info >/dev/null 2>&1; then DOCKER=docker
    elif $SUDO docker info >/dev/null 2>&1; then DOCKER="$SUDO docker"
    else die "Docker ishlamayapti. Tekshiring: sudo systemctl status docker"; fi
  fi
fi
$DOCKER compose version >/dev/null 2>&1 || die "Docker Compose plugin topilmadi: $SUDO apt-get install -y docker-compose-plugin"
compose() { $DOCKER compose "$@"; }

if [ -n "$DOMAIN" ] && command -v getent >/dev/null 2>&1 && ! getent hosts "$DOMAIN" >/dev/null 2>&1; then
  warn "$DOMAIN hali hech qanday IP'ga qaramayapti. DNS A-yozuvini shu server IP'siga qo'ying, aks holda HTTPS sertifikati olinmaydi."
fi

say "Image'lar build qilinmoqda (birinchi marta bir necha daqiqa)"
compose build api web

say "PostgreSQL ishga tushirilmoqda"
mkdir -p .local/postgres
compose up -d --wait postgres

say "Migratsiyalar va API database roli"
compose run --rm -T migrate </dev/null

if [ "$(get_env AUTH_MODE)" = local ]; then
  say "Sinov uchun demo ma'lumotlar"
  compose run --rm -T seed </dev/null
fi

say "API va web ishga tushirilmoqda"
compose up -d --wait api web
if [ -n "$DOMAIN" ]; then
  mkdir -p .local/caddy/data .local/caddy/config
  compose up -d caddy
fi

if [ -n "$ADMIN_EMAIL" ] && [ "$(get_env AUTH_MODE)" = email ]; then
  say "Admin taklif qilinmoqda: $ADMIN_EMAIL"
  compose run --rm -T migrate npm run -s invite -- "$ADMIN_EMAIL" </dev/null
fi

# Daily verified backup at 03:15, installed once for the current user.
if [ -n "$DOMAIN" ] && command -v crontab >/dev/null 2>&1; then
  CRON_LINE="15 3 * * * cd $ROOT && ./scripts/backup.sh >> $ROOT/.local/backups/backup.log 2>&1"
  if ! crontab -l 2>/dev/null | grep -Fq "$ROOT && ./scripts/backup.sh"; then
    mkdir -p .local/backups
    ( crontab -l 2>/dev/null; echo "$CRON_LINE" ) | crontab - && echo "Kunlik backup cron'ga qo'shildi (03:15)."
  fi
fi

# ---------------------------------------------------------------------------
# Verify
# ---------------------------------------------------------------------------
PORT=$(get_env NIYAT_HTTP_PORT)
if [ -n "$DOMAIN" ]; then URL="https://$DOMAIN"; else URL="http://SERVER_IP:$PORT"; fi

say "Tekshirilmoqda"
if curl -fsS "http://127.0.0.1:$PORT/v1/ready" >/dev/null 2>&1; then echo "API va database: tayyor"; else warn "API hali javob bermayapti: docker compose logs api"; fi
if [ -n "$DOMAIN" ]; then
  ok=0
  for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
    if curl -fsS "https://$DOMAIN/v1/ready" >/dev/null 2>&1; then ok=1; break; fi
    sleep 3
  done
  if [ "$ok" = 1 ]; then echo "HTTPS: tayyor ($URL)"
  else warn "HTTPS hali ishlamayapti. DNS va 80/443 portlar ochiqligini tekshiring: docker compose logs caddy"; fi
fi

cat <<EOF

────────────────────────────────────────────────────────────
 NIYAT ishga tushdi: $URL
────────────────────────────────────────────────────────────
EOF
if [ "$(get_env AUTH_MODE)" = email ]; then
  cat <<EOF
 1. $URL ni oching va ${ADMIN_EMAIL:-taklif qilingan emailingiz}ni kiriting.
EOF
  if [ -z "$(get_env RESEND_API_KEY)" ]; then
    echo "    Xat yuborilmaydi — havolani logdan oling:  docker compose logs api | grep login_token"
  fi
  cat <<EOF
 2. Birinchi kirishdan keyin o'zingizni moderator qiling:
      docker compose run --rm migrate npm run staff -- --grant moderator ${ADMIN_EMAIL:-EMAIL}
 3. Odamlarni taklif qiling:
      docker compose run --rm migrate npm run invite -- dost@example.com
EOF
else
  cat <<EOF
 Sinov rejimi: sahifa demo foydalanuvchi bilan avtomatik ochiladi.
 Haqiqiy ishga tushirish:  ./scripts/server-up.sh --domain DOMEN --email EMAIL --resend-key re_...
EOF
fi
cat <<EOF

 Holat:      docker compose ps
 Loglar:     docker compose logs -f api
 Ko'rsatkich: docker compose run --rm migrate npm run metrics
 Backup:     ./scripts/backup.sh      Yangilash: git pull && ./scripts/server-up.sh
 Batafsil:   DEPLOY.md
EOF
