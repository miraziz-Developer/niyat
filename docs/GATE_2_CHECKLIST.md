# Gate 1 → Gate 2 delivery checklist

This checklist turns `PRODUCT_BLUEPRINT.md` into verifiable delivery units. `[~]` means a contract/foundation exists but a deployed implementation is still required.

## Gate 1 — testable prototype

- [x] Landing, intent capsule, matching and consent-first intro flow
- [x] Today, Discover, Requests, Circles, Progress and Trust views
- [x] Responsive UI and native keyboard-operable controls
- [x] Dialog Escape close, focus trap and trigger focus restoration
- [x] Deterministic local demo and domain/application unit tests
- [x] Browser-persisted accepted intro → milestones → verified outcome → trust signal prototype
- [x] Empty states for user-owned collections
- [x] Server loading/connected/recoverable session-error indicators
- [~] Automated Chromium axe audit exists; manual screen-reader review remains

## Gate 2 — private alpha

- [~] Auth/session boundary — opaque, revocable PostgreSQL session + CSRF implemented; production identity provider open
- [~] PostgreSQL — `pg` runtime, migration runner, reversible migrations, constraints, RLS and persistent self-hosted Docker deployment rehearsed on PostgreSQL 17; managed deployment/backup drill open
- [~] Versioned REST/OpenAPI API — v1 contract and Node HTTP router implemented for profile, intent, intro and outcome slices; matches, blocks and reports open
- [~] Profile and intent CRUD — server slice verified on PostgreSQL with RLS enforced: owner-scoped reads, keyset pagination, lifecycle transitions, idempotent mutations and history-preserving delete; browser UI adapter open
- [~] Server-side matches — read contract and repository port exist; job queue/worker open
- [~] Intro lifecycle — handlers, policy, PostgreSQL adapter, read endpoint and runtime composition exist; full browser mutations/deployment open
- [x] Collaboration/outcome server slice — OpenAPI, reversible PostgreSQL migrations, runtime composition, browser adapter, authorization, durable replay and counterparty-only confirmation verified
- [x] Single-host private-alpha Docker stack — Nginx frontend, Node API, PostgreSQL, migration/seed jobs and one-command bootstrap
- [~] Block/report — contract, schema and RLS exist; moderation workflow open
- [ ] Notifications and delivery preferences
- [ ] Invite-only cohort and 30–50 alpha users
- [ ] Product analytics for publish activation and useful-match rating
- [ ] Alpha privacy notice, terms, retention schedule and incident owner

## Authorization and safety invariants

- AI may extract, rank and draft; it cannot authorize publication, intros, disclosure or moderation actions.
- Intent mutation is owner-only; foreign intents read as `404` so IDs cannot be probed.
- A published intent never returns to draft; completed and expired intents are immutable.
- An intent with intro history cannot be deleted, because deletion would cascade into the counterparty's intro and collaboration record.
- Profile updates cannot change `verificationLevel`.
- Match visibility requires ownership of one participating intent and no block edge.
- Intro creation requires an eligible reciprocal match; contacts remain private while pending.
- Only the receiver accepts/declines; only the sender cancels; terminal requests never reopen.
- Outcome verification requires completed milestones; only a distinct counterparty may confirm in the future server slice, and disputed outcomes emit no trust signal.
- Block takes effect before future discovery, intro or messaging checks.
- Reports enter human review; reporters cannot read moderator-only notes.
- Audit events are append-only and must not contain raw message bodies or exact location.

## Exit evidence

- Publish activation ≥ 60%.
- Useful-match rating ≥ 25%.
- Zero critical safety incidents.
- Authorization/illegal-transition tests, migration rehearsal, backup/restore drill and rollback owner recorded before cohort launch.