# Niyat code architecture

Kod feature-oriented Clean Architecture/DDD chegaralarida tashkil qilingan.

```text
src/
├── domain/
│   ├── model/          # Entity va domain turlari
│   └── matching/       # Frameworksiz sof matching qoidalari
├── application/
│   ├── matching/       # Matching use-case orchestration
│   ├── ports/          # Repository, service va state-store kontraktlari
│   └── requests/       # Intro request lifecycle use-case'lari
├── infrastructure/
│   ├── demo/           # Vaqtinchalik in-memory ma'lumot adapteri
│   ├── persistence/    # Browser storage adapteri
│   └── server/         # Framework/provider-neutral HTTP, session va SQL adapter chegaralari
└── presentation/
    ├── shared/         # Reusable React hook'lar
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

Bu Gate 1 local-first prototype va Gate 2 server-ready foundation. `infrastructure/demo` va browser storage application portlarini implement qiladi; keyinchalik UI o‘zgarmasdan HTTP adapterlariga almashtiriladi. PostgreSQL migration `db/migrations`, versionlangan API contract `contracts`, delivery holati esa [`GATE_2_CHECKLIST.md`](./GATE_2_CHECKLIST.md) da.

## Server authorization boundary

HTTP handler actorni rotating session’dan oladi, inputni OpenAPI schema bilan tekshiradi va actor ID’ni use-case/repository’ga explicit uzatadi. PostgreSQL transaction boshida `SET LOCAL app.user_id = ...` o‘rnatilib RLS defense-in-depth sifatida ishlaydi. RLS application policy o‘rnini bosmaydi. AI natijasi authorization inputi emas.

Intro request vertical slice Web `Request`/`Response`, `SessionResolver`, `IdempotencyStore` va `SqlDatabase` portlariga tayanadi; HTTP framework, auth provider va PostgreSQL driver composition root’da tanlanadi. `MemoryIdempotencyStore` faqat single-instance alpha/development uchun: multi-instance deployment oldidan durable PostgreSQL yoki Redis adapteri bilan almashtiriladi. Database runtime role internetdan bevosita ochilmaydi va faqat zarur schema/table/function grantlarini oladi.
