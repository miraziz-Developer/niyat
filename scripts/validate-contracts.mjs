import { readFileSync } from 'node:fs'

const contract = JSON.parse(readFileSync(new URL('../contracts/openapi.v1.json', import.meta.url), 'utf8'))
const migration = readFileSync(new URL('../db/migrations/0001_gate2_foundation.up.sql', import.meta.url), 'utf8')
const introAuthorizationMigration = readFileSync(new URL('../db/migrations/0002_intro_authorization.up.sql', import.meta.url), 'utf8')
const outcomeMigration = readFileSync(new URL('../db/migrations/0003_collaboration_outcomes.up.sql', import.meta.url), 'utf8')
const operationsMigration = readFileSync(new URL('../db/migrations/0007_alpha_operations.up.sql', import.meta.url), 'utf8')
const authMigration = readFileSync(new URL('../db/migrations/0006_invite_magic_link.up.sql', import.meta.url), 'utf8')
const runtimeMigration = readFileSync(new URL('../db/migrations/0004_runtime_foundation.up.sql', import.meta.url), 'utf8')
const matchingMigration = readFileSync(new URL('../db/migrations/0005_matching_safety.up.sql', import.meta.url), 'utf8')

const requiredPaths = ['/session', '/me/profile', '/intents', '/intents/{intentId}', '/intents/{intentId}/matches', '/matches/{matchId}/intro-requests', '/intro-requests', '/intro-requests/{requestId}', '/intro-requests/{requestId}/collaboration', '/me/collaborations', '/collaborations/{collaborationId}/milestones/{milestoneId}/complete', '/collaborations/{collaborationId}/outcome-verifications', '/outcome-verifications/{verificationId}', '/me/trust-signals', '/blocks', '/reports']
const requiredTables = ['users', 'profiles', 'intents', 'matches', 'intro_requests', 'blocks', 'reports', 'audit_events']
const outcomeTables = ['collaborations', 'collaboration_milestones', 'outcome_verifications', 'trust_signals']
const runtimeTables = ['sessions', 'idempotency_records']
const requiredSchemas = ['Profile', 'Intent', 'Match', 'MatchCounterpart', 'IntroCounterpart', 'IntroRequest', 'Collaboration', 'Milestone', 'OutcomeVerification', 'TrustSignal']
const failures = []

if (contract.openapi !== '3.1.0') failures.push('OpenAPI version must be 3.1.0')
for (const path of requiredPaths) if (!contract.paths[path]) failures.push(`Missing API path: ${path}`)
for (const table of requiredTables) if (!new RegExp(`CREATE TABLE ${table} \\(`).test(migration)) failures.push(`Missing table: ${table}`)
for (const table of outcomeTables) if (!new RegExp(`CREATE TABLE ${table} \\(`).test(outcomeMigration)) failures.push(`Missing outcome table: ${table}`)
for (const table of runtimeTables) if (!new RegExp(`CREATE TABLE ${table} \\(`).test(runtimeMigration)) failures.push(`Missing runtime table: ${table}`)
for (const schema of requiredSchemas) if (!contract.components?.schemas?.[schema]) failures.push(`Missing API schema: ${schema}`)
for (const [path, item] of Object.entries(contract.paths)) {
  for (const [method, operation] of Object.entries(item)) {
    if (!['get', 'post', 'patch', 'put', 'delete'].includes(method)) continue
    if (!operation.operationId) failures.push(`${method.toUpperCase()} ${path} has no operationId`)
    // Sign-in routes run before a session exists; single-use tokens make them naturally idempotent.
    const mutates = ['post', 'patch', 'put', 'delete'].includes(method) && !(path === '/session' && method === 'delete') && !path.startsWith('/auth/')
    const parameters = operation.parameters ?? item.parameters ?? []
    if (mutates && !parameters.some(parameter => parameter.$ref === '#/components/parameters/IdempotencyKey')) failures.push(`${method.toUpperCase()} ${path} has no Idempotency-Key`)
  }
}
for (const marker of ['ENABLE ROW LEVEL SECURITY', 'intro_requests_transition_guard', 'only receiver may accept or decline', 'only sender may cancel', 'blocks_no_self', 'audit_events_immutable']) {
  if (!migration.includes(marker)) failures.push(`Migration safety marker missing: ${marker}`)
}
for (const marker of ['SECURITY DEFINER', 'SET search_path = pg_catalog, public, pg_temp', "current_setting('app.user_id'", 'NOT EXISTS', 'public.blocks', 'REVOKE ALL']) {
  if (!introAuthorizationMigration.includes(marker)) failures.push(`Intro authorization marker missing: ${marker}`)
}
for (const marker of ['ENABLE ROW LEVEL SECURITY', 'collaboration_outcome_transition_guard', 'milestone_completion_guard', 'outcome_verification_request_guard', 'outcome_verification_resolution_guard', 'only a distinct counterparty may resolve verification', 'outcome_one_pending_per_collaboration_idx', 'trust_distinct_participants']) {
  if (!outcomeMigration.includes(marker)) failures.push(`Outcome migration safety marker missing: ${marker}`)
}
for (const marker of ['ALTER TABLE matches ENABLE ROW LEVEL SECURITY', 'matches_participant_all', 'SECURITY DEFINER', 'SET search_path = pg_catalog, public, pg_temp', "visibility <> 'private'", 'public.blocks', 'REVOKE ALL ON FUNCTION matchable_intents', 'REVOKE ALL ON FUNCTION match_counterpart', "intro_requests.status = 'accepted'", 'audit_events_no_truncate']) {
  if (!matchingMigration.includes(marker)) failures.push(`Matching migration safety marker missing: ${marker}`)
}

for (const marker of ['CREATE TABLE invitations (', 'CREATE TABLE login_tokens (', 'token_hash text NOT NULL UNIQUE']) {
  if (!authMigration.includes(marker)) failures.push(`Auth migration marker missing: ${marker}`)
}

for (const marker of ['users_terms_pair', 'CREATE TABLE notification_outbox (', 'FUNCTION is_moderator()', 'report_decisions_moderator_all', 'candidate_owner.status = \'active\'', 'FUNCTION moderation_subject', 'WHERE public.is_moderator()', 'match_feedback_owner_all', 'FUNCTION run_maintenance()', 'maintenance must run without an actor', 'REVOKE ALL ON FUNCTION run_maintenance() FROM PUBLIC']) {
  if (!operationsMigration.includes(marker)) failures.push(`Operations migration marker missing: ${marker}`)
}

visit(contract, value => {
  if (typeof value.$ref !== 'string' || !value.$ref.startsWith('#/')) return
  let target = contract
  for (const segment of value.$ref.slice(2).split('/')) target = target?.[segment]
  if (!target) failures.push(`Unresolved local reference: ${value.$ref}`)
})

function visit(value, action) {
  if (!value || typeof value !== 'object') return
  action(value)
  for (const child of Object.values(value)) visit(child, action)
}

if (failures.length) {
  console.error(failures.join('\n'))
  process.exit(1)
}
console.log(`Validated ${Object.keys(contract.paths).length} API paths, ${Object.keys(contract.components.schemas).length} schemas, and ${requiredTables.length + outcomeTables.length + runtimeTables.length} core tables.`)