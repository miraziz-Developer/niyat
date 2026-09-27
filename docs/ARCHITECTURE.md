# Niyat code architecture

Kod feature-oriented Clean Architecture/DDD chegaralarida tashkil qilingan.

```text
src/
├── domain/
│   ├── model/          # Entity va domain turlari
│   └── matching/       # Frameworksiz sof, simmetrik reciprocal scoring
├── application/
│   ├── matching/       # Demo ranking va server matching porti
│   ├── collaborations/ # Accepted intro va milestone lifecycle
│   ├── outcomes/       # Verification va trust-signal invariantlari
│   ├── profiles/       # Profile o‘qish/yangilash use-case'i
│   ├── intents/        # Intent CRUD va status lifecycle qoidalari
│   ├── safety/         # Block va shikoyat use-case'lari
│   ├── ports/          # Repository, service va state-store kontraktlari
│   └── requests/       # Intro request lifecycle use-case'lari
├── infrastructure/
│   ├── demo/           # Vaqtinchalik in-memory ma'lumot adapteri
│   ├── persistence/    # Browser storage adapteri
│   ├── http/           # Browser API klienti (NetworkClient implementatsiyasi)
│   └── server/         # Node HTTP, session, idempotency va PostgreSQL adapterlari
└── presentation/
    ├── shared/         # Reusable hook'lar, persistence va network context
    ├── workspace/      # Workspace UI va uning komponentlari
    └── styles/         # Global design system
```

## Dependency qoidasi

Dependency ichkariga qaraydi:

`presentation → application → domain`

`infrastructure` domain kontraktlarini amalga oshiradi va composition root orqali ulanadi. Domain React, browser API, demo data yoki persistence haqida bilmaydi.

## Kod joylashtirish qoidasi

- Yangi biznes invariantlari `domain` yoki `application` qatlamida yoziladi va unit test bilan qoplanadi.
- `presentation` ichida authorization yoki muhim biznes qarori yozilmaydi.
- Network/database adapterlari `infrastructure` ichida bo‘ladi.
- Takroriy UI shared component yoki hook sifatida ajratiladi.
- Barrel exportlar hozircha ishlatilmaydi; explicit import dependency’ni ko‘rinadigan saqlaydi.

## Hozirgi chegara

Default rejim `infrastructure/demo` va browser storage’dan foydalanadi. `VITE_API_MODE=server` bo‘lsa `main.tsx` composition root’i `NiyatApi`ni `NetworkProvider` orqali beradi; presentation faqat `application/ports/network-client.ts` portiga tayanadi va fetch yoki infrastructure’ni bevosita chaqirmaydi. Server rejimida workspace har mutatsiyadan keyin server read-model’ini qayta o‘qiydi, shuning uchun UI holatni taxmin qilmaydi. PostgreSQL migration `db/migrations`, versionlangan API contract `contracts`, delivery holati esa [`GATE_2_CHECKLIST.md`](./GATE_2_CHECKLIST.md) da.

## Server authorization boundary

HTTP handler actorni server session’dan oladi, inputni OpenAPI schema bilan tekshiradi va actor ID’ni use-case/repository’ga explicit uzatadi. PostgreSQL transaction boshida `SET LOCAL app.user_id = ...` o‘rnatilib RLS defense-in-depth sifatida ishlaydi. RLS application policy o‘rnini bosmaydi. AI natijasi authorization inputi emas.

HTTP qatlami bitta `endpoint` helper (session, CSRF, `Idempotency-Key`, UUID path param) va deklarativ resurs jadvali (`http/resources.ts`) atrofida qurilgan; har bir contract path shu jadvalda. Handlerlar Web `Request`/`Response`, `SessionResolver`, `IdempotencyStore` va `SqlDatabase` portlariga tayanadi. `server/index.ts` Node HTTP, `pg`, PostgreSQL session va durable idempotency adapterlarini composition qiladi. Outcome gateway accepted intro → milestones → evidence → counterparty-only decision → deduplicated trust signal zanjirini bajaradi. Local bootstrap session faqat non-production `AUTH_MODE=local`da ochiladi. Production `AUTH_MODE=email`: `ManageMagicLinks` (application) taklif qilingan emailga bir martalik havola yuboradi, `Mailer` porti Resend yoki dev konsol adapteri orqali ishlaydi, `http/auth-endpoints.ts` sessiyasiz ikki route’ni (Origin tekshiruvi va IP limit bilan) yuritadi, `PostgresMagicLinkGateway` tokenni shartli UPDATE bilan bir marta iste’mol qiladi va birinchi kirishda akkaunt yaratadi. Konfiguratsiya `infrastructure/server/config.ts`da startup’da tekshiriladi. `PgDatabase` ichki `transaction` chaqiruvlarini mavjud (ambient) tranzaksiyaga qo‘shadi; shu Unit of Work tufayli idempotency record biznes o‘zgarishi bilan bir tranzaksiyada commit qilinadi va restartdan keyin replay qilinadi. Database runtime role internetdan bevosita ochilmaydi va faqat zarur grantlarni olishi kerak.

## Matching va maxfiylik

`domain/matching/score-intents.ts` simmetrik skor beradi: juftlik bir marta canonical tartibda (`left_intent_id < right_intent_id`) saqlanadi va har tomon uchun alohida tushuntiriladi. Niyat yaratilganda yoki yangilanganda `ManageIntents` match’larni qayta hisoblaydi; faol bo‘lmagan yoki maxfiy niyatning intro tarixi yo‘q match’lari olib tashlanadi. Boshqa foydalanuvchi niyatini o‘qish faqat `SECURITY DEFINER` funksiyalar orqali bo‘ladi (`matchable_intents`, `match_counterpart`): ular block’larni hisobga oladi va `display_name`ni faqat qabul qilingan intro’dan keyin qaytaradi. `matches` jadvalida RLS yoqilgan.

## Alpha operatsiyalari

- **Rozilik:** `ManageConsents` joriy shartlar versiyasini beradi; `endpoint` helperidagi `consentGate` profil, rozilik va bildirishnoma sozlamalaridan boshqa barcha mutatsiyalarni 18+ va joriy shartlar qabul qilinguncha `403 consent_required` bilan to‘xtatadi.
- **Bildirishnomalar:** gateway’lar `enqueueNotification` orqali outbox qatorini biznes tranzaksiyasi ichida yozadi. `NotificationDispatcher` (application) `NotificationQueue` va `Mailer` portlariga tayanadi; Postgres navbati qatorlarni `FOR UPDATE SKIP LOCKED` bilan lease qiladi, shuning uchun bir nechta instans xavfsiz.
- **Moderatsiya:** `staff_roles` va `is_moderator()` RLS siyosatlari; moderator boshqa a’zolar niyatini faqat `moderation_subject()` orqali (qisqa yorliq) ko‘radi. To‘xtatilgan a’zo sessiya tekshiruvidan va `matchable_intents`dan o‘tmaydi.
- **Analytics:** `recordEvent` hodisani chaqiruvchi tranzaksiyasida yozadi (rollback bo‘lgan ish hisoblanmaydi); matn yozilmaydi. `scripts/metrics.ts` Gate 2 chiqish ko‘rsatkichlarini hisoblaydi.
- **Texnik xizmat:** `run_maintenance()` (SECURITY DEFINER, actor’siz ishlaydi) va `infrastructure/server/jobs.ts` scheduler’i; runtime rolga keng DELETE grantlari kerak emas.

## Self-hosted runtime

`compose.yaml` bitta hostda PostgreSQL 17, bir martalik migration/seed joblari, Node API va Nginx static frontend/reverse proxy’ni boshqaradi. Tashqi trafik faqat web portga kiradi; `/v1` Nginx orqali ichki `api:3000` servisiga uzatiladi. PostgreSQL bind mount `.local/postgres`da persistent saqlanadi va public interface’ga bind qilinmaydi. `scripts/server-up.sh` clone’dan keyingi idempotent build, migrate va start orchestration’ni bajaradi.

Docker deployment default holatda private-alpha `AUTH_MODE=local` bootstrap’ini qo‘llaydi; ochiq internet uchun `AUTH_MODE=email`, `APP_ORIGIN`, `MAIL_FROM`, `RESEND_API_KEY` beriladi va `VITE_DEV_USER_ID` bo‘sh qoldiriladi. Taklif ro‘yxati `npm run invite` bilan owner rolida boshqariladi.
