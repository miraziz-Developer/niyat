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
- [~] Automated Chromium axe audit covers local demo and the server-mode match drawer, progress and trust views; manual screen-reader review remains

## Gate 2 — private alpha

- [~] Auth/session boundary — opaque, revocable PostgreSQL session + CSRF implemented; production identity provider open
- [~] PostgreSQL — `pg` runtime, migration runner, reversible migrations, constraints, RLS and persistent self-hosted Docker deployment rehearsed on PostgreSQL 17; managed deployment/backup drill open
- [x] Versioned REST/OpenAPI API — every v1 contract path is served by the declarative router (session, profile, intents, matches, intros, collaboration/outcome, trust signals, blocks, reports)
- [x] Profile and intent CRUD — owner-scoped reads, keyset pagination, lifecycle transitions, idempotent mutations, history-preserving delete, and browser onboarding (profile + intent in one publish) in server mode
- [~] Server-side matches — reciprocal scoring refreshed synchronously on intent create/update (≤500 candidates, ≤20 matches per intent), explained per viewer with limitations, identity hidden until consent; background worker/queue for scale open
- [x] Intro lifecycle — create/accept/decline from the browser, counterpart read model, expired requests reported, one intro per match; persisted expiry sweeper open
- [x] Collaboration/outcome server slice — OpenAPI, reversible PostgreSQL migrations, runtime composition, browser adapter, authorization, durable replay and counterparty-only confirmation verified
- [x] Single-host private-alpha Docker stack — Nginx frontend, Node API, PostgreSQL, migration/seed jobs and one-command bootstrap
- [x] Atomic idempotency — replay record commits in the same transaction as the business change
- [ ] Separate non-owner runtime database role in Docker (RLS is bypassed while the API connects as the table owner)
- [~] Block/report — block closes pending intros and hides the pair from matching; reports are audited and rate-limited (20/day); moderator review tooling open
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
- Private intents never enter matching in either direction.
- A counterparty's display name is revealed only after an intro on that match is accepted.
- Blocking closes pending intros between the pair with the role-legal status (sender cancels, receiver declines).
- Audit events reject UPDATE, DELETE and TRUNCATE.
- Intro creation requires an eligible reciprocal match; contacts remain private while pending.
- Only the receiver accepts/declines; only the sender cancels; terminal requests never reopen.
- Outcome verification requires completed milestones; only a distinct counterparty may confirm, and disputed outcomes emit no trust signal.
- Block takes effect before future discovery, intro or messaging checks.
- Reports enter human review; reporters cannot read moderator-only notes.
- Audit events are append-only and must not contain raw message bodies or exact location.

## Exit evidence

- Publish activation ≥ 60%.
- Useful-match rating ≥ 25%.
- Zero critical safety incidents.
- Authorization/illegal-transition tests, migration rehearsal, backup/restore drill and rollback owner recorded before cohort launch.