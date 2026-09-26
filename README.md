# Niyat — Intent Network MVP

Odamlarning statik profillarini emas, hozirgi niyatlarini o‘zaro qiymat asosida bog‘laydigan local-first prototip.

To‘liq mahsulot, arxitektura, xavfsizlik, metrikalar va 0→100 release rejasi:

[`docs/PRODUCT_BLUEPRINT.md`](./docs/PRODUCT_BLUEPRINT.md)

Kod qatlamlari va dependency qoidalari: [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)

Gate 2 holati va ochiq launch talablari: [`docs/GATE_2_CHECKLIST.md`](./docs/GATE_2_CHECKLIST.md)

## Ishga tushirish

### Serverda bitta script bilan

Talab: Linux serverda Git, Docker Engine va Docker Compose plugin o‘rnatilgan bo‘lishi kerak.

```bash
git clone https://github.com/miraziz-Developer/niyat.git
cd niyat
./scripts/server-up.sh
```

Script `.env` uchun kuchli tasodifiy PostgreSQL paroli yaratadi, Docker image’larni build qiladi, PostgreSQL migration va private-alpha seed’ni bajaradi, keyin Nginx frontend hamda Node API’ni ishga tushiradi.

Default manzil: `http://SERVER_IP:8080`. Portni `.env` ichidagi `NIYAT_HTTP_PORT` bilan o‘zgartirish mumkin.

```bash
docker compose ps
docker compose logs -f api web postgres
docker compose down
```

Migration jadval egasi sifatida bajariladi, API esa alohida `niyat_app` roli bilan ulanadi: u RLS’ni chetlab o‘tmaydi, DDL qila olmaydi va audit jurnaliga faqat yozadi. `server-up.sh` bu rol parolini ham `.env` ga avtomatik qo‘shadi (eski o‘rnatishlarda ham). Production’da API RLS’ni chetlab o‘tadigan rol bilan ishga tushishni rad etadi.

PostgreSQL internetga ochilmaydi; u faqat `127.0.0.1:55432` va ichki Docker network’da mavjud. Persistent data `.local/postgres/` ichida qoladi. Server backup’i `pg_dump` bilan olinishi kerak.

> **Xavfsizlik:** avtomatik bootstrap `AUTH_MODE=local` private alpha uchun. Production identity provider ulanmaguncha `8080` portni ochiq internetga qo‘ymang; firewall yoki VPN bilan cheklang. `NODE_ENV=production` bilan local auth server tomonidan rad etiladi.

### Lokal frontend development

```bash
npm install
npm run dev
```

Tekshiruvlar:

```bash
npm test
npm run lint
npm run contracts:validate
npm run build
npm run test:e2e
```

## PostgreSQL API runtime

Node HTTP composition root, `pg` adapteri va migration runner mavjud. Faqat database’ni lokal development uchun ko‘tarish:

```bash
npm run db:up
npm run db:migrate:local
npm run dev:api:local
VITE_API_MODE=server npm run dev
```

Database `127.0.0.1:55432` da ishlaydi va ma’lumotlar loyihaning Git’dan chiqarilgan `.local/postgres/` katalogida saqlanadi. `npm run db:down` konteynerni o‘chiradi, lekin ma’lumotni saqlab qoladi; loglar uchun `npm run db:logs` ishlatiladi. `.local/postgres/`ni o‘chirish database’ni qaytarib bo‘lmas tarzda tozalaydi. Muhim ma’lumot uchun alohida backup zarur.

Tashqi yoki keyinchalik bitta katta serverdagi PostgreSQL ishlatilsa, lokal scriptlar o‘rniga server bergan `DATABASE_URL` bilan odatiy buyruqlar ishlatiladi:

```bash
DATABASE_URL='postgresql://...' npm run db:migrate
DATABASE_URL='postgresql://...' npm run dev:api
```

`dev:api` faqat local/private-alpha bootstrap (`AUTH_MODE=local`) uchun. Mavjud user bilan session ochish:

```bash
curl -c cookies.txt -X POST \
  -H 'X-Dev-User-Id: <existing-user-uuid>' \
  http://127.0.0.1:3000/v1/dev/session
```

Seed qilingan database’ga qarshi ishlab turgan API’ni end-to-end tekshirish (`API_URL` default: `http://127.0.0.1:3000/v1`):

```bash
npm run smoke:api       # collaboration → outcome verification → trust signal
npm run smoke:network   # profile, intent CRUD, matching, consent, block va report
```

Ikkala smoke ham yangi seed qilingan database kutadi. Server rejimidagi to‘liq brauzer oqimi (onboarding → anonim match → intro → rozilik → hamkorlik → hamkor tasdig‘i) uchun API va server-mode frontend ishlab turganda:

```bash
VITE_API_MODE=server VITE_DEV_USER_ID=00000000-0000-4000-8000-000000000004 npx vite --port 4174
NIYAT_E2E_APP=http://127.0.0.1:4174 npm run test:e2e
```

Production’da `AUTH_MODE=local` qat’iy rad etiladi; OAuth/passkey/magic-link provider session yaratish oqimiga ulanishi shart. API va browser dev serverlari birga ishlaganda Vite `/v1` so‘rovlarini `127.0.0.1:3000` ga proxy qiladi. Docker stack’da Nginx shu proxy vazifasini bajaradi.

## Secretlar

`.env.example` faqat nomlar va xavfsiz lokal defaultlarni ko‘rsatadi. Haqiqiy API keylar Git’ga yozilmaydi. Chat, screenshot yoki commitda ko‘ringan key provider panelida revoke qilinib, yangisi faqat server environment’iga qo‘yilishi kerak. Resend adapteri notification use-case bilan birga server tomonida ulanadi; browser bundle’ga `RESEND_API_KEY` berilmaydi.

## MVP gipotezasi

Foydalanuvchi “nima bera olaman / menga nima kerak” formatida niyat yaratadi. Tizim faqat ikkala tomonga qiymat mavjud bo‘lgan aloqalarni yuqoriga chiqaradi. Kontaktlar ikki tomon roziligisiz ochilmaydi.

## Hozir mavjud

- Intent Capsule va workspace holatini brauzerda saqlash
- Deterministik, tushuntiriladigan reciprocal matching
- Demo tarmoq va ranked matchlar
- Consent-gated intro so‘rovi
- Today dashboard va daily mission
- Discover, saqlangan matchlar va izohli recommendation
- Incoming/outgoing request lifecycle
- Accepted intro → milestone → outcome verification → trust signal core loop
- Circles va progress journey
- Trust Center va foydalanuvchi ruxsatlari
- Responsive interfeys va matching unit testlari
- PostgreSQL Gate 2 migration va versionlangan OpenAPI 3.1 contract
- Server adapterlari uchun repository/service ports va DB authorization baseline
- Collaboration/outcome uchun OpenAPI endpointlari, PostgreSQL persistence, transaction gateway va authenticated HTTP handlerlar
- Node HTTP router/composition root, `pg` pool, DB migration runner, rotating opaque session va PostgreSQL idempotency store
- To‘liq server rejimi (`VITE_API_MODE=server`): onboarding, niyatni e’lon qilish, server match’lari, intro yuborish/qabul qilish, hamkorlik, milestone, hamkor tasdig‘i, block va shikoyat
- Profile va intent CRUD: owner-only kirish, keyset pagination, lifecycle qoidalari va intro tarixi bor niyatni o‘chirishdan himoya
- Server-side reciprocal matching: har tomon uchun alohida tushuntirish va cheklovlar; ism faqat intro qabul qilingach ochiladi; maxfiy niyatlar match bo‘lmaydi
- Block (kutilayotgan intro’larni yopadi va juftlikni yashiradi) va audit qilinadigan, kunlik limitli shikoyat navbati
- Idempotency record biznes o‘zgarishi bilan bitta tranzaksiyada commit qilinadi
- Chromium responsive E2E, server-mode brauzer oqimi va axe accessibility testlari

## Keyingi validatsiya

Bu hali production ijtimoiy tarmoq emas. Backend qurishdan oldin 30–50 foydalanuvchi bilan quyidagilar o‘lchanadi:

1. Niyatni to‘liq yaratish foizi
2. Kamida bitta intro so‘rash foizi
3. Ikki tomonlama acceptance
4. 7 kun ichida yangi niyat bilan qaytish

Default UI local-first demo bo‘lib qoladi. `VITE_API_MODE=server` rejimida butun workspace serverdan ishlaydi va brauzer storage’iga server ma’lumoti yozilmaydi; requester o‘z natijasini tasdiqlay olmaydi, qarorni faqat hamkor o‘z sessiyasidan beradi. Local demo’dagi counterparty tugmasi faqat prototip simulyatsiyasidir. Circles hozircha faqat demo’da.

Keyingi bosqich: production auth provider, matching uchun background worker, notification va moderator vositalari, analytics va deployment observability. DID/blockchain MVP uchun ataylab qo‘shilmadi.
