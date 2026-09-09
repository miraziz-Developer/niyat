# Gate 1 → Gate 2 delivery checklist

This checklist turns `PRODUCT_BLUEPRINT.md` into verifiable delivery units. `[~]` means a contract/foundation exists but a deployed implementation is still required.

## Gate 1 — testable prototype

- [x] Landing, intent capsule, matching and consent-first intro flow
- [x] Today, Discover, Requests, Circles, Progress and Trust views
- [x] Responsive UI and native keyboard-operable controls
- [x] Dialog Escape close, focus trap and trigger focus restoration
- [x] Deterministic local demo and domain/application unit tests
- [x] Empty states for user-owned collections
- [~] Loading, recoverable error and offline indicators — UI boundary remains after API adapter exists
- [ ] Automated browser accessibility audit and screen-reader review

## Gate 2 — private alpha

- [~] Auth/session boundary — cookie + CSRF contract exists; provider and implementation open
- [~] PostgreSQL — reversible initial migration, constraints, indexes and initial RLS exist; deployed DB open
- [~] Versioned REST/OpenAPI API — v1 contract exists; TypeScript service implementation open
- [~] Profile and intent CRUD — API and repository ports exist; adapters open
- [~] Server-side matches — read contract and repository port exist; job queue/worker open
- [~] Intro lifecycle — framework-neutral handlers, application policy, PostgreSQL transaction adapter and DB constraints exist; runtime composition/deployment open
- [~] Block/report — contract, schema and RLS exist; moderation workflow open
- [ ] Notifications and delivery preferences
- [ ] Invite-only cohort and 30–50 alpha users
- [ ] Product analytics for publish activation and useful-match rating
- [ ] Alpha privacy notice, terms, retention schedule and incident owner

## Authorization and safety invariants

- AI may extract, rank and draft; it cannot authorize publication, intros, disclosure or moderation actions.
- Intent mutation is owner-only.
- Match visibility requires ownership of one participating intent and no block edge.
- Intro creation requires an eligible reciprocal match; contacts remain private while pending.
- Only the receiver accepts/declines; only the sender cancels; terminal requests never reopen.
- Block takes effect before future discovery, intro or messaging checks.
- Reports enter human review; reporters cannot read moderator-only notes.
- Audit events are append-only and must not contain raw message bodies or exact location.

## Exit evidence

- Publish activation ≥ 60%.
- Useful-match rating ≥ 25%.
- Zero critical safety incidents.
- Authorization/illegal-transition tests, migration rehearsal, backup/restore drill and rollback owner recorded before cohort launch.