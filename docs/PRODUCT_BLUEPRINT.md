# NIYAT — Product & Engineering Blueprint

**Holat:** Living specification 1.0  
**North star:** haftalik tasdiqlangan foydali natijalar (Weekly Verified Outcomes, WVO)  
**Va’da:** “Niyatingni ayt — keyingi eng foydali aloqani va harakatni top.”

## 1. Mahsulot chegarasi

Niyat — intent graph va consent protokoliga tayangan koordinatsiya tarmog‘i. Asosiy obyekt profil yoki post emas, muddati va natijasi bor `Intent` hisoblanadi. Platforma odam, guruh, resurs va imkoniyatlarni bir tomonlama relevancy emas, o‘zaro qiymat bo‘yicha bog‘laydi.

### Mahsulot qiladigan ishlar

1. Erkin matn/ovozdan strukturali niyat yaratadi.
2. Niyatni odam, imkoniyat, circle va resurs bilan moslaydi.
3. Har bir tavsiyani tushuntiradi va uncertainty ko‘rsatadi.
4. Ikki tomon roziligidan keyin xavfsiz aloqa ochadi.
5. Aloqani milestone va tasdiqlangan natijaga olib boradi.
6. Natijalardan matching sifatini yaxshilaydi.

### Mahsulot qilmaydigan ishlar

- engagement uchun cheksiz feed yaratmaydi;
- roziliksiz xabar yubormaydi yoki kontakt ochmaydi;
- follower sonini trust deb hisoblamaydi;
- yuqori xavfli qarorni AI’ga to‘liq topshirmaydi;
- shaxsiy intent ma’lumotlarini reklama uchun sotmaydi.

## 2. Dastlabki bozor

**Beachhead:** Markaziy Osiyodagi 18+ builder, founder, designer, engineer va growth mutaxassislari.  
**Job to be done:** “Aniq loyiham uchun 14 kun ichida ishonchli va o‘zaro manfaatli hamkor topish.”

Bu segmentda talab tez tekshiriladi, natija aniq va har muvaffaqiyatli match tarmoqqa yangi odam olib kiradi. Universal yosh/toifa keyinchalik alohida safety rejimlari bilan ochiladi.

## 3. Asosiy sikl

`Create intent → clarify → publish → receive matches → request intro → mutual consent → workspace → milestone → verified outcome → share/referral → new intent`

### Aktivatsiya ta’rifi

Foydalanuvchi aktiv hisoblanadi, agar 24 soatda:

- niyatni nashr etsa;
- kamida 3 tushuntirilgan match ko‘rsa;
- intro so‘rasa yoki boshqa niyatga yordam taklif qilsa.

### Aha moment

“Platforma men qidirgan odamni emas, ikkalamiz bir-birimizga nima bera olishimizni topdi.”

## 4. Rollar va ruxsatlar

| Rol | Imkoniyat |
|---|---|
| Guest | Landing, ochiq Intent Card, invite qabul qilish |
| Member | Intent, match, request, chat, circle, progress |
| Verified member | Yuqori ishonch talab qiladigan intentlar |
| Circle host | 4–8 kishilik sprint boshqaruvi |
| Organization | Team seat, private talent pool, analytics |
| Moderator | Queue, appeal, enforcement; private chatga default kirish yo‘q |
| Admin | Operatsion boshqaruv; barcha amallar audit qilinadi |

## 5. Axborot arxitekturasi

### Public

- Landing
- Intent Card
- Public outcome story
- Safety va privacy sahifalari
- Sign in / invite acceptance

### Authenticated

1. **Today** — bitta next best action, faol intentlar, yangi collisions.
2. **Discover** — People, Intents, Opportunities, Resources, Circles.
3. **Create** — AI-assisted Intent Capsule builder.
4. **Requests** — incoming, outgoing, accepted, archived.
5. **Circles** — muddatli hamkorlik sprintlari.
6. **Progress** — milestones, outcomes va impact graph.
7. **Trust Center** — identity, permissions, sessions, blocks, export/delete.

## 6. Muhim user flow’lar

### A. Onboarding

1. Locale → 2. 18+ confirmation → 3. auth → 4. name/timezone/languages → 5. free-text intent → 6. AI clarification → 7. capsule preview → 8. field-level visibility → 9. publish → 10. first matches.

**SLO:** median 4 daqiqadan kam.  
**Fallback:** AI ishlamasa manual form ishlaydi.  
**Exit:** draft saqlanadi, majburiy publish yo‘q.

### B. Intro va consent

1. Sender match explanation’ni o‘qiydi.
2. Scope (`15 min advice`, `paid work`, `cofounder exploration`) tanlaydi.
3. AI draft qiladi, inson tahrir/tasdiq qiladi.
4. Receiver offer, ask, time cost va trust signalini ko‘radi.
5. Accept / question / later / decline / report.
6. Accept bo‘lsa conversation room ochiladi.

### C. Outcome

1. Tomonlar milestone belgilaydi.
2. Reminder faqat foydali va boshqariladigan chastotada keladi.
3. Har tomon alohida outcome yuboradi.
4. Ikkalasi tasdiqlasa `verified`; mos kelmasa review.
5. Public card faqat alohida rozilik bilan yaratiladi.

## 7. Funksional talablar

### Intent

- title, desired outcome, offers, needs, topics;
- mode, language, geography, budget, collaboration type;
- start/end/expiry, active/paused/completed/expired;
- har field uchun public/matched/private visibility;
- edit history va duplicate detection;
- share token va revoke.

### Matching

Pipeline:

1. safety eligibility;
2. hard filters;
3. semantic candidate retrieval;
4. reciprocal utility scoring;
5. trust/logistics/risk reranking;
6. diversity cap;
7. explanation generation;
8. feedback logging.

Boshlang‘ich formula:

`score = 0.30 need_offer + 0.25 offer_need + 0.15 semantic_goal + 0.10 logistics + 0.10 trust + 0.10 outcome_prior - risk_penalty`

Score ehtimollik emas. UI’da “match strength” sifatida beriladi. Har tavsiyada evidence, limitation va feedback bo‘ladi.

### Circles

- 4–8 member, bitta shared outcome;
- 7/14/30 kun;
- host, member, observer;
- check-in, milestone, meeting, artifact;
- inactivity cleanup va archive;
- private-by-default.

### Trust & safety

- block/report/mute har bir aloqa nuqtasida;
- rate limits, invite throttling, spam classifier;
- adult-only launch; minor mode alohida legal/safety release;
- sensitive intent taxonomy;
- human appeal;
- immutable moderation audit log;
- exact location va contact private-by-default;
- emergency/medical/legal intents uchun safe completion va professional routing.

## 8. Ma’lumot modeli

Asosiy jadvallar:

- `users(id, status, locale, timezone, created_at, deleted_at)`
- `profiles(user_id, display_name, bio, city_precision, languages, verification_level)`
- `capabilities(id, canonical_name, embedding)`
- `profile_capabilities(user_id, capability_id, evidence, visibility)`
- `intents(id, owner_id, title, outcome, mode, horizon, status, visibility, expires_at)`
- `intent_offers(intent_id, capability_id, detail)`
- `intent_needs(intent_id, capability_id, detail)`
- `intent_topics(intent_id, topic_id)`
- `matches(id, left_intent_id, right_intent_id, score, explanation, model_version, status)`
- `intro_requests(id, match_id, sender_id, receiver_id, scope, message, status, expires_at)`
- `conversations(id, match_id, opened_at, closed_at)`
- `messages(id, conversation_id, sender_id, body_ciphertext, created_at)`
- `milestones(id, conversation_id, owner_id, title, due_at, status)`
- `outcomes(id, match_id, type, evidence, verification_status)`
- `circles`, `circle_members`, `circle_checkins`
- `reports`, `blocks`, `consents`, `audit_events`
- `notifications`, `experiments`, `analytics_events`

Har multi-tenant query’da owner/membership policy. PII va chat alohida encryption boundary’da. Analytics eventlarda raw message yoki exact location bo‘lmaydi.

## 9. API kontraktlari

- `POST /v1/intents/draft`
- `POST /v1/intents/:id/clarify`
- `POST /v1/intents/:id/publish`
- `GET /v1/intents/:id/matches?cursor=`
- `POST /v1/matches/:id/feedback`
- `POST /v1/matches/:id/intro-requests`
- `PATCH /v1/intro-requests/:id`
- `POST /v1/conversations/:id/messages`
- `POST /v1/conversations/:id/milestones`
- `POST /v1/matches/:id/outcomes`
- `POST /v1/reports`, `POST /v1/blocks`
- `GET/PATCH /v1/me/consents`
- `POST /v1/me/export`, `DELETE /v1/me`

Mutationlar idempotency key oladi. Pagination cursor-based. Error formati: `{ code, message, field?, requestId }`.

## 10. AI arxitekturasi

- LLM — extraction va explanation uchun; authorization uchun emas.
- Structured output schema validation’dan o‘tadi.
- Retrieval embedding + hard filters bilan boshlanadi.
- Har model/prompt version loglanadi.
- PII redaction modelga yuborishdan oldin bajariladi.
- Prompt injection tashqi resource matni sifatida izolatsiya qilinadi.
- High-impact actions doim deterministic policy engine va human confirmation’dan o‘tadi.
- Offline eval set: intent extraction, reciprocal relevance, explanation faithfulness, safety.
- Online guardrails: complaint rate, decline rate, block rate, accepted-intro-to-outcome.

## 11. Texnik arxitektura

### V1

- Web: React + TypeScript + Vite, PWA-ready.
- API: TypeScript service, REST/OpenAPI.
- DB: PostgreSQL + pgvector.
- Queue: managed job queue for matching/notifications.
- Auth: passkey/OAuth/email magic link, session rotation.
- Storage: encrypted object store.
- Observability: structured logs, traces, Sentry-compatible errors, product analytics.

### Security baseline

- TLS, encryption at rest, secret manager;
- CSP, CSRF protection, secure cookies, input schemas;
- row-level authorization tests;
- dependency/SAST scan in CI;
- backup restore drill;
- audit log and admin least privilege;
- abuse rate limits and account recovery.

### Kelajak

- MCP: foydalanuvchi ruxsati bilan calendar, tasks va tashqi resource connectorlari.
- Portable identity/DID: faqat interoperability talabi isbotlangach; MVP dependency emas.

## 12. Monetizatsiya

- Free: 1 active intent, standard matches/intros.
- Plus: multiple intents, global filters, translation, advanced assistant.
- Pro: collaboration workspace, calendar, analytics, verification.
- Organization: seats, private graph, sourcing, controls, SLA.
- Transaction: escrow/milestone bozori qonuniy va product fit bo‘lgach.

Reklama va intent data savdosi biznes modeliga kirmaydi.

## 13. Metrikalar

### North star

`WVO = haftada ikki tomon tasdiqlagan foydali natijalar`

### Funnel

- landing → intent draft;
- draft → publish;
- publish → meaningful match viewed;
- view → intro request;
- request → mutual accept;
- accept → first meeting/message;
- collaboration → verified outcome;
- outcome → invite/share;
- W1/W4 intent retention.

### Guardrail

- report/block rate;
- unwanted contact rate;
- false-positive match feedback;
- median response burden;
- demographic match exposure parity;
- AI cost per verified outcome.

## 14. Release gates: 0 → 100%

### Gate 0 — Product truth (100% complete)

- vision, scope, user, metric, safety and architecture documented.

### Gate 1 — Testable prototype

- landing, capsule, matching, intro consent, dashboard, discover, requests, circles, progress, trust;
- responsive and keyboard-usable;
- local deterministic demo and unit tests.

### Gate 2 — Private alpha

- real auth/database/API;
- profile and intent CRUD;
- server-side matching jobs;
- request lifecycle, notifications, block/report;
- 30–50 invited users.

**Exit:** ≥60% publish activation, ≥25% useful-match rating, zero critical safety incidents.

### Gate 3 — Closed beta

- semantic matching, AI clarification, multilingual;
- conversation room, milestones, outcomes;
- moderation console and observability.

**Exit:** ≥20% accepted intro → meaningful outcome; W4 retained intent creators ≥25%.

### Gate 4 — Product-market signal

- Intent Cards, referral attribution, circles;
- paid Plus experiment;
- 1,000 targeted users.

**Exit:** organic coefficient >0.3, ≥5% qualified paid conversion or strong B2B pull.

### Gate 5 — Public v1

- security review, privacy/legal docs, backups, support and incident response;
- mobile PWA, accessibility WCAG AA target;
- reliable billing and deletion/export.

### Gate 6 — Marketplace

- verified providers, milestone payment, disputes, transaction compliance.

### Gate 7 — Agent layer

- permission-scoped MCP connections;
- action preview, approval, revocation and audit.

### Gate 8 — Global network

- region-by-region liquidity;
- localized trust/safety and legal operation;
- organization network and portable intent protocol.

## 15. Definition of done

Funksiya faqat UI ko‘ringanda emas, quyidagilar bo‘lganda tayyor:

- happy path, empty/loading/error/offline states;
- authorization va abuse case;
- unit/integration/e2e test;
- analytics event va dashboard;
- accessibility review;
- localization-ready copy;
- rollback/migration rejasi;
- user-facing privacy explanation;
- owner va success metric.

## 16. Birinchi 90 kun

**1–2 hafta:** prototype + 15 problem interview.  
**3–5 hafta:** auth, DB, intent CRUD, server matching, private invites.  
**6–8 hafta:** requests, notifications, safety, outcome tracking.  
**9–10 hafta:** semantic retrieval va AI clarification eval.  
**11–12 hafta:** 50-user alpha, haftalik concierge review, top failure’larni tuzatish.

Eng muhim qoida: roadmap feature soni bilan emas, WVO va safety bilan boshqariladi.