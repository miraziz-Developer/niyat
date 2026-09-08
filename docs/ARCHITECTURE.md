# Niyat code architecture

Kod feature-oriented Clean Architecture/DDD chegaralarida tashkil qilingan.

```text
src/
├── domain/
│   ├── model/          # Entity va domain turlari
│   └── matching/       # Frameworksiz sof matching qoidalari
├── application/
│   ├── matching/       # Matching use-case orchestration
│   └── requests/       # Intro request lifecycle use-case'lari
├── infrastructure/
│   ├── demo/           # Vaqtinchalik in-memory ma'lumot adapteri
│   └── persistence/    # Browser storage adapteri
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

Bu Gate 1 local-first prototype. `infrastructure/demo` va browser storage keyinchalik server API adapterlari bilan almashtiriladi. Production schema, endpoint, security va release gate’lar [`PRODUCT_BLUEPRINT.md`](./PRODUCT_BLUEPRINT.md) da belgilangan.