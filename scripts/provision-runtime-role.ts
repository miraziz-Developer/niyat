import pg from 'pg'

/*
 * Creates or updates the least-privilege role the API connects as. Run as the schema owner after migrations.
 * The owner bypasses row-level security; this role does not, so RLS is enforced at runtime.
 */
const databaseUrl = process.env.DATABASE_URL
const role = process.env.NIYAT_APP_DB_USER ?? 'niyat_app'
const password = process.env.NIYAT_APP_DB_PASSWORD
if (!databaseUrl) throw new Error('DATABASE_URL is required')
if (!/^[a-z_][a-z0-9_]{0,62}$/.test(role)) throw new Error('NIYAT_APP_DB_USER must be a lowercase PostgreSQL identifier')
if (!password || password.length < 24) throw new Error('NIYAT_APP_DB_PASSWORD must contain at least 24 characters')

// Table privileges mirror what the gateways actually do; anything absent here is denied.
const grants: Record<string, string[]> = {
  // Column-scoped: the API may record consent and moderation status, never rewrite identity columns.
  users: ['SELECT', 'INSERT', 'UPDATE (is_adult_confirmed, terms_version, terms_accepted_at, status, updated_at)'],
  auth_identities: ['SELECT', 'INSERT', 'UPDATE'],
  invitations: ['SELECT', 'UPDATE'],
  login_tokens: ['SELECT', 'INSERT', 'UPDATE'],
  profiles: ['SELECT', 'INSERT', 'UPDATE'],
  intents: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
  matches: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
  intro_requests: ['SELECT', 'INSERT', 'UPDATE'],
  blocks: ['SELECT', 'INSERT'],
  reports: ['SELECT', 'INSERT', 'UPDATE'],
  audit_events: ['INSERT'],
  collaborations: ['SELECT', 'INSERT', 'UPDATE'],
  collaboration_milestones: ['SELECT', 'INSERT', 'UPDATE'],
  outcome_verifications: ['SELECT', 'INSERT', 'UPDATE'],
  trust_signals: ['SELECT', 'INSERT'],
  sessions: ['SELECT', 'INSERT', 'UPDATE'],
  idempotency_records: ['SELECT', 'INSERT', 'UPDATE'],
  notification_preferences: ['SELECT', 'INSERT', 'UPDATE'],
  notification_outbox: ['SELECT', 'INSERT', 'UPDATE'],
  staff_roles: ['SELECT'],
  report_decisions: ['SELECT', 'INSERT'],
  analytics_events: ['INSERT'],
  match_feedback: ['SELECT', 'INSERT', 'UPDATE'],
}
const functions = ['eligible_intro_receiver(uuid, uuid)', 'owns_intent(uuid)', 'matchable_intents(uuid)', 'match_counterpart(uuid)', 'is_moderator()', 'run_maintenance()', 'moderation_subject(text, uuid, uuid)']

const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 })
const client = await pool.connect()
try {
  const owner = (await client.query<{ current_user: string; db: string }>('SELECT current_user, current_database() AS db')).rows[0]!
  if (owner.current_user === role) throw new Error('Run this script as the schema owner, not as the runtime role')

  await client.query('BEGIN')
  const exists = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [role])
  const verb = exists.rowCount ? 'ALTER' : 'CREATE'
  // format() quotes the identifier and literal server-side; utility statements cannot take bind parameters.
  const statement = await client.query<{ sql: string }>(
    `SELECT format('${verb} ROLE %I WITH LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS INHERIT', $1::text, $2::text) AS sql`,
    [role, password],
  )
  await client.query(statement.rows[0]!.sql)

  const ident = async (template: string, ...values: string[]) => {
    const built = await client.query<{ sql: string }>(`SELECT format($1, ${values.map((_, index) => `$${index + 2}::text`).join(', ')}) AS sql`, [template, ...values])
    await client.query(built.rows[0]!.sql)
  }
  await ident('GRANT CONNECT ON DATABASE %I TO %I', owner.db, role)
  await ident('GRANT USAGE ON SCHEMA public TO %I', role)
  // Start from nothing so a removed privilege is actually revoked on re-provisioning.
  await ident('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', role)
  await ident('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM %I', role)
  for (const [table, privileges] of Object.entries(grants)) {
    await ident(`GRANT ${privileges.join(', ')} ON TABLE public.%I TO %I`, table, role)
  }
  for (const signature of functions) await client.query(`GRANT EXECUTE ON FUNCTION public.${signature} TO ${role}`)
  await client.query('COMMIT')

  const check = await client.query<{ rolsuper: boolean; rolbypassrls: boolean }>('SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = $1', [role])
  if (check.rows[0]?.rolsuper || check.rows[0]?.rolbypassrls) throw new Error(`${role} must not bypass row-level security`)
  console.log(`Runtime role ${role} is ready (row-level security enforced).`)
} catch (error) {
  await client.query('ROLLBACK').catch(() => undefined)
  throw error
} finally {
  client.release()
  await pool.end()
}
