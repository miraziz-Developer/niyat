# Niyat — Intent Network MVP

Odamlarning statik profillarini emas, hozirgi niyatlarini o‘zaro qiymat asosida bog‘laydigan local-first prototip.

**Loyiha joylashuvi:** `/Users/mirazizerkinaliyev_dev/Projects/niyat`

To‘liq mahsulot, arxitektura, xavfsizlik, metrikalar va 0→100 release rejasi:

[`docs/PRODUCT_BLUEPRINT.md`](./docs/PRODUCT_BLUEPRINT.md)

Kod qatlamlari va dependency qoidalari: [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)

Gate 2 holati va ochiq launch talablari: [`docs/GATE_2_CHECKLIST.md`](./docs/GATE_2_CHECKLIST.md)

## Ishga tushirish

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

Node HTTP composition root, `pg` adapteri va migration runner mavjud:

```bash
export DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/niyat
npm run db:migrate
npm run dev:api
VITE_API_MODE=server npm run dev
```

`dev:api` faqat local/private-alpha bootstrap (`AUTH_MODE=local`) uchun. Mavjud user bilan session ochish:

```bash
curl -c cookies.txt -X POST \
  -H 'X-Dev-User-Id: <existing-user-uuid>' \
  http://127.0.0.1:3000/v1/dev/session
```

Production’da `AUTH_MODE=local` qat’iy rad etiladi; OAuth/passkey/magic-link provider session yaratish oqimiga ulanishi shart. API va browser dev serverlari birga ishlaganda Vite `/v1` so‘rovlarini `127.0.0.1:3000` ga proxy qiladi.

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
- Server read-model hydration va outcome mutationlariga ulangan opt-in browser adapter (`VITE_API_MODE=server`)
- Chromium responsive E2E va axe accessibility smoke testlari

## Keyingi validatsiya

Bu hali production ijtimoiy tarmoq emas. Backend qurishdan oldin 30–50 foydalanuvchi bilan quyidagilar o‘lchanadi:

1. Niyatni to‘liq yaratish foizi
2. Kamida bitta intro so‘rash foizi
3. Ikki tomonlama acceptance
4. 7 kun ichida yangi niyat bilan qaytish

Default UI local-first demo bo‘lib qoladi. `VITE_API_MODE=server` rejimida intro read-model, collaboration, milestone, verification va trust signal oqimi serverdan hydrate qilinadi; requester o‘z natijasini tasdiqlay olmaydi. Local demo’dagi counterparty tugmasi faqat prototip simulyatsiyasidir.

Keyingi bosqich: production auth provider, profile/intent/match UI adapterlari, notification/moderation delivery, analytics va deployment observability. PostgreSQL idempotency restartdan keyingi replayni saqlaydi; mutatsiya commit’i bilan idempotency record yozuvi orasidagi crash window’ni to‘liq yopish uchun keyinchalik bitta transaction/UoW kerak. DID/blockchain MVP uchun ataylab qo‘shilmadi.
