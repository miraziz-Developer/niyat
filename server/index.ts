import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import pg from 'pg'
import { ManageIntents } from '../src/application/intents/intent'
import { ManageIntroRequests } from '../src/application/intros/intro-request'
import { ManageOutcomeVerifications } from '../src/application/outcomes/server-outcome-verification'
import { ManageProfiles } from '../src/application/profiles/profile'
import { createApiRouter } from '../src/infrastructure/server/http/router'
import { HttpError, requireCsrf, requireSession } from '../src/infrastructure/server/http/security'
import { PgDatabase } from '../src/infrastructure/server/postgres/pg-database'
import { PostgresIdempotencyStore } from '../src/infrastructure/server/postgres/postgres-idempotency-store'
import { PostgresIntentGateway } from '../src/infrastructure/server/postgres/postgres-intent-gateway'
import { PostgresIntroRequestGateway } from '../src/infrastructure/server/postgres/postgres-intro-request-gateway'
import { PostgresOutcomeVerificationGateway } from '../src/infrastructure/server/postgres/postgres-outcome-verification-gateway'
import { PostgresProfileGateway } from '../src/infrastructure/server/postgres/postgres-profile-gateway'
import { PostgresSessionResolver } from '../src/infrastructure/server/postgres/postgres-session-resolver'

const databaseUrl = process.env.DATABASE_URL
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
if (!databaseUrl) throw new Error('DATABASE_URL is required')
if (process.env.NODE_ENV === 'production' && process.env.AUTH_MODE === 'local') throw new Error('AUTH_MODE=local is forbidden in production')

const poolSize = Number(process.env.DATABASE_POOL_SIZE ?? 10)
if (!Number.isInteger(poolSize) || poolSize < 2) throw new Error('DATABASE_POOL_SIZE must be an integer of at least 2')
const pool = new pg.Pool({ connectionString: databaseUrl, max: poolSize })
const database = new PgDatabase(pool)
const sessions = new PostgresSessionResolver(pool)
const outcomes = new ManageOutcomeVerifications(new PostgresOutcomeVerificationGateway(database))
const router = createApiRouter({
  sessions,
  idempotency: new PostgresIdempotencyStore(pool),
  intros: new ManageIntroRequests(new PostgresIntroRequestGateway(database)),
  outcomes,
  profiles: new ManageProfiles(new PostgresProfileGateway(database)),
  intents: new ManageIntents(new PostgresIntentGateway(database)),
})
const port = Number(process.env.PORT ?? 3000)
const host = process.env.HOST ?? '127.0.0.1'

const server = createServer(async (incoming, outgoing) => {
  try {
    const request = await toWebRequest(incoming)
    const url = new URL(request.url)
    let response: Response
    if (url.pathname === '/v1/dev/session' && request.method === 'POST' && process.env.AUTH_MODE === 'local' && process.env.NODE_ENV !== 'production') {
      const userId = request.headers.get('x-dev-user-id') ?? ''
      if (!uuid.test(userId)) response = Response.json({ code: 'invalid_user', message: 'X-Dev-User-Id must be a UUID', requestId: crypto.randomUUID() }, { status: 400 })
      else {
        const created = await sessions.createLocalSession(userId)
        response = Response.json(created.session, { status: 201, headers: { 'set-cookie': created.cookie } })
      }
    } else if (url.pathname === '/v1/session' && request.method === 'DELETE') {
      const session = await requireSession(request, sessions)
      requireCsrf(request, session)
      await sessions.revoke(request)
      response = new Response(null, { status: 204, headers: { 'set-cookie': 'niyat_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' } })
    } else response = await router(request)
    await send(outgoing, response)
  } catch (error) {
    console.error(error)
    const problem = error instanceof HttpError ? error : new HttpError(500, 'internal_error', 'An unexpected error occurred')
    await send(outgoing, Response.json({ code: problem.code, message: problem.message, requestId: crypto.randomUUID() }, { status: problem.status, headers: { 'content-type': 'application/problem+json' } }))
  }
})

server.listen(port, host, () => console.log(`NIYAT API listening on http://${host}:${port}`))
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => server.close(() => pool.end().finally(() => process.exit(0))))

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
  return new Request(new URL(request.url ?? '/', origin), { method, headers: request.headers as HeadersInit, body })
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