#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker o‘rnatilmagan. Avval Docker Engine va Compose pluginini o‘rnating." >&2
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose plugin topilmadi." >&2
  exit 1
fi

if [ ! -f .env ]; then
  if command -v openssl >/dev/null 2>&1; then
    POSTGRES_PASSWORD=$(openssl rand -hex 24)
  else
    POSTGRES_PASSWORD=$(od -An -N24 -tx1 /dev/urandom | tr -d ' \n')
  fi

  cat > .env <<EOF
POSTGRES_DB=niyat
POSTGRES_USER=niyat
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
NIYAT_HTTP_PORT=8080
NIYAT_POSTGRES_PORT=55432
NIYAT_NODE_ENV=development
AUTH_MODE=local
EOF
  chmod 600 .env
  echo "Yangi .env xavfsiz tasodifiy PostgreSQL paroli bilan yaratildi."
fi

echo "NIYAT image’lari build qilinmoqda..."
docker compose build api web

echo "PostgreSQL ishga tushirilmoqda..."
docker compose up -d --wait postgres

echo "Migrationlar bajarilmoqda..."
docker compose run --rm -T migrate </dev/null

if grep -q '^AUTH_MODE=local$' .env; then
  echo "Private-alpha demo ma’lumotlari tayyorlanmoqda..."
  docker compose run --rm -T seed </dev/null
fi

echo "API va web ishga tushirilmoqda..."
docker compose up -d --wait api web

HTTP_PORT=$(sed -n 's/^NIYAT_HTTP_PORT=//p' .env | tail -1)
HTTP_PORT=${HTTP_PORT:-8080}

echo
echo "NIYAT ishga tushdi: http://SERVER_IP:$HTTP_PORT"
echo "Holat: docker compose ps"
echo "Loglar: docker compose logs -f api web postgres"
echo "To‘xtatish: docker compose down"
echo
echo "DIQQAT: AUTH_MODE=local faqat private alpha uchun. Production auth ulanmaguncha servisni ochiq internetga chiqarmang."