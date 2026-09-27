import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import pg from 'pg'
import { ManageMagicLinks } from '../src/application/auth/magic-link'
import { ManageConsents } from '../src/application/consent/consent'
import { ManageModeration } from '../src/application/moderation/moderation'
import { ManageNotificationPreferences, NotificationDispatcher } from '../src/application/notifications/notifications'
import { ManageIntents } from '../src/application/intents/intent'
import { ManageIntroRequests } from '../src/application/intros/intro-request'
import { ManageMatches } from '../src/application/matching/server-matching'
import { ManageOutcomeVerifications } from '../src/application/outcomes/server-outcome-verification'
import { ManageProfiles } from '../src/application/profiles/profile'
import { ManageSafety } from '../src/application/safety/safety'
import { loadConfig } from '../src/infrastructure/server/config'
import { clientIpHeader, createAuthHandler } from '../src/infrastructure/server/http/auth-endpoints'
import { RateLimiter } from '../src/infrastructure/server/http/rate-limiter'
import { schedule } from '../src/infrastructure/server/jobs'
import { createApiRouter } from '../src/infrastructure/server/http/router'
import { HttpError, requireCsrf, requireSession } from '../src/infrastructure/server/http/security'
import { ConsoleMailer, ResendMailer } from '../src/infrastructure/server/mail'
import { PgDatabase } from '../src/infrastructure/server/postgres/pg-database'
import { PostgresConsentGateway } from '../src/infrastructure/server/postgres/postgres-consent-gateway'
import { PostgresNotificationQueue, PostgresPreferencesGateway } from '../src/infrastructure/server/postgres/postgres-notifications'
import { PostgresIdempotencyStore } from '../src/infrastructure/server/postgres/postgres-idempotency-store'
import { PostgresIntentGateway } from '../src/infrastructure/server/postgres/postgres-intent-gateway'
import { PostgresModerationGateway } from '../src/infrastructure/server/postgres/postgres-moderation-gateway'
import { PostgresMagicLinkGateway } from '../src/infrastructure/server/postgres/postgres-magic-link-gateway'
import { PostgresIntroRequestGateway } from '../src/infrastructure/server/postgres/postgres-intro-request-gateway'
import { PostgresMatchingGateway } from '../src/infrastructure/server/postgres/postgres-matching-gateway'
import { PostgresOutcomeVerificationGateway } from '../src/infrastructure/server/postgres/postgres-outcome-verification-gateway'
import { PostgresProfileGateway } from '../src/infrastructure/server/postgres/postgres-profile-gateway'
import { PostgresSafetyGateway } from '../src/infrastructure/server/postgres/postgres-safety-gateway'
import { PostgresSessionResolver } from '../src/infrastructure/server/postgres/postgres-session-resolver'
import { tokenCrypto } from '../src/infrastructure/server/token-crypto'

const config = loadConfig(process.env)
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const pool = new pg.Pool({ connectionString: config.databaseUrl, max: config.poolSize })
// An idle client can be dropped by PostgreSQL (restart, failover); without this listener the whole process exits.
pool.on('error', error => console.error('PostgreSQL idle client error', error.message))
await assertRowLevelSecurity(pool)
const database = new PgDatabase(pool)
const sessions = new PostgresSessionResolver(pool, { secure: config.secureCookies })
const mailer = config.mail.transport === 'resend' ? new ResendMailer(config.mail.apiKey, config.mail.from) : new ConsoleMailer()
const auth = config.appOrigin
  ? createAuthHandler({
      magicLinks: new ManageMagicLinks(new PostgresMagicLinkGateway(database), mailer, sessions, tokenCrypto, { appOrigin: config.appOrigin, ttlMinutes: 15, hourlyLimit: 5, reportError: error => console.error('Sign-in mail delivery failed', error instanceof Error ? error.message : error) }),
      limiter: new RateLimiter(20, 10 * 60_000),
      allowedOrigin: config.appOrigin,
    })
  : undefined
const matches = new ManageMatches(new PostgresMatchingGateway(database))
const consents = new ManageConsents(new PostgresConsentGateway(database))
const router = createApiRouter({
  sessions,
  consents,
  consentGate: consents,
  moderation: new ManageModeration(new PostgresModerationGateway(database)),
  notificationPreferences: new ManageNotificationPreferences(new PostgresPreferencesGateway(database)),
  idempotency: new PostgresIdempotencyStore(database),
  profiles: new ManageProfiles(new PostgresProfileGateway(database)),
  intents: new ManageIntents(new PostgresIntentGateway(database), matches),
  matches,
  intros: new ManageIntroRequests(new PostgresIntroRequestGateway(database)),
  outcomes: new ManageOutcomeVerifications(new PostgresOutcomeVerificationGateway(database)),
  safety: new ManageSafety(new PostgresSafetyGateway(database)),
  auth,
  ready: async () => (await pool.query('SELECT 1')).rowCount === 1,
})
const { port, host } = config
const devBootstrap = config.authMode === 'local' && !config.production

// Background work stays in this process for the single-host alpha; both jobs are safe to run on several instances
// (the outbox leases rows with SKIP LOCKED, maintenance statements are idempotent).
const jobs = [
  schedule('maintenance', 60 * 60_000, async () => {
    const result = await pool.query('SELECT * FROM run_maintenance()')
    const counts = result.rows[0] as Record<string, number>
    if (Object.values(counts).some(count => count > 0)) console.log(`maintenance ${JSON.stringify(counts)}`)
  }),
  // Links in notifications need the public origin; without it (bare local dev) the outbox simply waits.
  ...(config.appOrigin ? [schedule('notifications', 30_000, async () => {
    const dispatcher = new NotificationDispatcher(new PostgresNotificationQueue(database), mailer, config.appOrigin!)
    while (await dispatcher.runOnce() > 0) { /* drain the backlog */ }
  })] : []),
]

const server = createServer(async (incoming, outgoing) => {
  const started = performance.now()
  try {
    const request = await toWebRequest(incoming)
    const url = new URL(request.url)
    let response: Response
    if (url.pathname === '/v1/dev/session' && request.method === 'POST' && devBootstrap) {
      const userId = request.headers.get('x-dev-user-id') ?? ''
      if (!uuid.test(userId)) response = Response.json({ code: 'invalid_user', message: 'X-Dev-User-Id must be a UUID', requestId: crypto.randomUUID() }, { status: 400 })
      else {
        const created = await sessions.create(userId)
        response = Response.json(created.session, { status: 201, headers: { 'set-cookie': created.cookie } })
      }
    } else if (url.pathname === '/v1/session' && request.method === 'DELETE') {
      const session = await requireSession(request, sessions)
      requireCsrf(request, session)
      await sessions.revoke(request)
      response = new Response(null, { status: 204, headers: { 'set-cookie': sessions.clearCookie() } })
    } else response = await router(request)
    await send(outgoing, response)
    logRequest(request.method, url.pathname, response.status, started)
  } catch (error) {
    console.error(error)
    const problem = error instanceof HttpError ? error : new HttpError(500, 'internal_error', 'An unexpected error occurred')
    await send(outgoing, Response.json({ code: problem.code, message: problem.message, requestId: crypto.randomUUID() }, { status: problem.status, headers: { 'content-type': 'application/problem+json' } }))
  }
})

server.listen(port, host, () => console.log(`NIYAT API listening on http://${host}:${port} (auth: ${config.authMode}${config.appOrigin ? `, magic links for ${config.appOrigin} via ${config.mail.transport}` : ''})`))
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => { for (const job of jobs) job.stop(); server.close(() => pool.end().finally(() => process.exit(0))) })

/** One JSON line per request; ids in paths are collapsed so logs aggregate by route and carry no identifiers. */
function logRequest(method: string, pathname: string, status: number, started: number) {
  if (pathname === '/v1/health' || pathname === '/v1/ready') return
  const route = pathname.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
  console.log(JSON.stringify({ level: status >= 500 ? 'error' : 'info', method, route, status, ms: Math.round(performance.now() - started) }))
}

async function toWebRequest(request: IncomingMessage): Promise<Request> {
  const origin = `http://${request.headers.host ?? `${host}:${port}`}`
  const method = request.method ?? 'GET'
  let body: string | undefined
  if (method !== 'GET' && method !== 'HEAD') {
    const chunks: Buffer[] = []
    let size = 0
    for await (const chunk of request) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      size += buffer.length
      if (size > 1_048_576) throw new HttpError(413, 'payload_too_large', 'Request body exceeds 1 MiB')
      chunks.push(buffer)
    }
    body = Buffer.concat(chunks).toString('utf8')
  }
  const headers = new Headers(request.headers as HeadersInit)
  // Rate limits key on this header, so a client-supplied value is always overwritten.
  const forwarded = config.trustProxy ? request.headers['x-real-ip'] : undefined
  headers.set(clientIpHeader, (typeof forwarded === 'string' && forwarded) || request.socket.remoteAddress || 'unknown')
  return new Request(new URL(request.url ?? '/', origin), { method, headers, body })
}

async function send(response: ServerResponse, value: Response): Promise<void> {
  response.statusCode = value.status
  value.headers.forEach((header, name) => response.setHeader(name, header))
  response.setHeader('x-content-type-options', 'nosniff')
  response.setHeader('referrer-policy', 'no-referrer')
  response.setHeader('cache-control', 'no-store')
  if (value.body) for await (const chunk of Readable.fromWeb(value.body as never)) response.write(chunk)
  response.end()
}

/** A table owner, superuser or BYPASSRLS role silently disables every RLS policy; production must not run that way. */
async function assertRowLevelSecurity(connection: pg.Pool): Promise<void> {
  const result = await connection.query<{ role: string; bypasses: boolean; owns: boolean }>(`
    SELECT current_user AS role, rolsuper OR rolbypassrls AS bypasses,
           EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tableowner = current_user) AS owns
    FROM pg_roles WHERE rolname = current_user`)
  const identity = result.rows[0]
  if (!identity?.bypasses && !identity?.owns) return
  const message = `Database role ${identity.role} bypasses row-level security; connect the API as the provisioned runtime role (npm run db:provision-role)`
  if (config.production) throw new Error(message)
  console.warn(`WARNING: ${message}`)
}
