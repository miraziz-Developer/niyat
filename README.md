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
```

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
- Circles va progress journey
- Trust Center va foydalanuvchi ruxsatlari
- Responsive interfeys va matching unit testlari
- PostgreSQL Gate 2 migration va versionlangan OpenAPI 3.1 contract
- Server adapterlari uchun repository/service ports va DB authorization baseline

## Keyingi validatsiya

Bu hali production ijtimoiy tarmoq emas. Backend qurishdan oldin 30–50 foydalanuvchi bilan quyidagilar o‘lchanadi:

1. Niyatni to‘liq yaratish foizi
2. Kamida bitta intro so‘rash foizi
3. Ikki tomonlama acceptance
4. 7 kun ichida yangi niyat bilan qaytish

Keyingi bosqich: provider tanlash, auth/session va TypeScript API adapterlarini implement qilish, migration’ni real PostgreSQL’da rehearsal qilish, moderation va notification oqimlarini ulash. DID/blockchain MVP uchun ataylab qo‘shilmadi.