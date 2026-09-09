import { readFileSync } from 'node:fs'

const contract = JSON.parse(readFileSync(new URL('../contracts/openapi.v1.json', import.meta.url), 'utf8'))
const migration = readFileSync(new URL('../db/migrations/0001_gate2_foundation.up.sql', import.meta.url), 'utf8')
const introAuthorizationMigration = readFileSync(new URL('../db/migrations/0002_intro_authorization.up.sql', import.meta.url), 'utf8')

const requiredPaths = ['/session', '/me/profile', '/intents', '/intents/{intentId}', '/intents/{intentId}/matches', '/matches/{matchId}/intro-requests', '/intro-requests/{requestId}', '/blocks', '/reports']
const requiredTables = ['users', 'profiles', 'intents', 'matches', 'intro_requests', 'blocks', 'reports', 'audit_events']
const failures = []

if (contract.openapi !== '3.1.0') failures.push('OpenAPI version must be 3.1.0')
for (const path of requiredPaths) if (!contract.paths[path]) failures.push(`Missing API path: ${path}`)
for (const table of requiredTables) if (!new RegExp(`CREATE TABLE ${table} \\(`).test(migration)) failures.push(`Missing table: ${table}`)
for (const [path, item] of Object.entries(contract.paths)) {
  for (const [method, operation] of Object.entries(item)) {
    if (!['get', 'post', 'patch', 'put', 'delete'].includes(method)) continue
    if (!operation.operationId) failures.push(`${method.toUpperCase()} ${path} has no operationId`)
    const mutates = ['post', 'patch', 'put', 'delete'].includes(method) && !(path === '/session' && method === 'delete')
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

if (failures.length) {
  console.error(failures.join('\n'))
  process.exit(1)
}
console.log(`Validated ${Object.keys(contract.paths).length} API paths and ${requiredTables.length} core tables.`)