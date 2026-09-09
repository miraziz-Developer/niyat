import { ApplicationError, type ManageIntroRequests, type ServerIntroRequest } from '../../../application/intros/intro-request'
import { IdempotencyConflictError, type IdempotencyStore, type SessionResolver } from '../ports'
import { HttpError, requireCsrf, requireIdempotencyKey, requireSession } from './security'

type Dependencies = {
  sessions: SessionResolver
  idempotency: IdempotencyStore
  intros: ManageIntroRequests
  requestId?: () => string
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function createIntroRequestHandler(dependencies: Dependencies) {
  return async (request: Request, matchId: string): Promise<Response> => {
    const requestId = dependencies.requestId?.() ?? crypto.randomUUID()
    try {
      if (request.method !== 'POST') throw new HttpError(405, 'method_not_allowed', 'Method not allowed')
      assertUuid(matchId, 'matchId')
      const session = await requireSession(request, dependencies.sessions)
      requireCsrf(request, session)
      const key = requireIdempotencyKey(request)
      const body = await readObject(request)
      assertExactKeys(body, ['scope', 'message'])
      const scope = readString(body, 'scope', 1, 200)
      const message = readString(body, 'message', 0, 2000)
      const fingerprint = JSON.stringify({ matchId, scope, message })
      const value = await dependencies.idempotency.run(session.userId, 'createIntroRequest', key, fingerprint, () =>
        dependencies.intros.create({ actorId: session.userId, matchId, scope, message }),
      )
      return json(value, 201)
    } catch (error) {
      return problem(error, requestId)
    }
  }
}

export function transitionIntroRequestHandler(dependencies: Dependencies) {
  return async (request: Request, requestIdParam: string): Promise<Response> => {
    const requestId = dependencies.requestId?.() ?? crypto.randomUUID()
    try {
      if (request.method !== 'PATCH') throw new HttpError(405, 'method_not_allowed', 'Method not allowed')
      assertUuid(requestIdParam, 'requestId')
      const session = await requireSession(request, dependencies.sessions)
      requireCsrf(request, session)
      const key = requireIdempotencyKey(request)
      const body = await readObject(request)
      assertExactKeys(body, ['status'])
      const status = readString(body, 'status', 1, 20)
      if (status !== 'accepted' && status !== 'declined' && status !== 'cancelled') {
        throw new HttpError(400, 'invalid_request', 'Status must be accepted, declined, or cancelled', 'status')
      }
      const fingerprint = JSON.stringify({ requestId: requestIdParam, status })
      const value = await dependencies.idempotency.run(session.userId, 'transitionIntroRequest', key, fingerprint, () =>
        dependencies.intros.transition({ actorId: session.userId, requestId: requestIdParam, status }),
      )
      return json(value, 200)
    } catch (error) {
      return problem(error, requestId)
    }
  }
}

async function readObject(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    throw new HttpError(415, 'unsupported_media_type', 'Content-Type must be application/json')
  }
  try {
    const value: unknown = await request.json()
    if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error()
    return value as Record<string, unknown>
  } catch {
    throw new HttpError(400, 'invalid_json', 'Request body must be a JSON object')
  }
}

function assertExactKeys(value: Record<string, unknown>, allowed: string[]): void {
  const unexpected = Object.keys(value).find(key => !allowed.includes(key))
  if (unexpected) throw new HttpError(400, 'invalid_request', `Unexpected field: ${unexpected}`, unexpected)
}

function readString(value: Record<string, unknown>, field: string, minimum: number, maximum: number): string {
  const candidate = value[field]
  if (typeof candidate !== 'string' || candidate.length < minimum || candidate.length > maximum) {
    throw new HttpError(400, 'invalid_request', `${field} must contain ${minimum} to ${maximum} characters`, field)
  }
  return candidate
}

function assertUuid(value: string, field: string): void {
  if (!uuid.test(value)) throw new HttpError(400, 'invalid_request', `${field} must be a UUID`, field)
}

function json(value: ServerIntroRequest, status: number): Response {
  return Response.json(value, { status })
}

function problem(error: unknown, requestId: string): Response {
  const mapped = error instanceof HttpError
    ? error
    : error instanceof IdempotencyConflictError
      ? new HttpError(409, 'idempotency_conflict', error.message)
    : error instanceof ApplicationError
      ? new HttpError(error.code === 'forbidden' ? 403 : error.code === 'not_found' ? 404 : 409, error.code, error.message)
      : new HttpError(500, 'internal_error', 'An unexpected error occurred')
  return Response.json(
    { code: mapped.code, message: mapped.message, ...(mapped.field ? { field: mapped.field } : {}), requestId },
    { status: mapped.status, headers: { 'content-type': 'application/problem+json' } },
  )
}