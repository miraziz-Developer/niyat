import { ApplicationError } from '../../../application/intros/intro-request'
import type { ManageOutcomeVerifications, VerificationDecision } from '../../../application/outcomes/server-outcome-verification'
import { IdempotencyConflictError, type IdempotencyStore, type SessionResolver } from '../ports'
import { HttpError, requireCsrf, requireIdempotencyKey, requireSession } from './security'

type Dependencies = { sessions: SessionResolver; idempotency: IdempotencyStore; outcomes: ManageOutcomeVerifications; requestId?: () => string }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function createCollaborationHandler(dependencies: Dependencies) {
  return mutation(dependencies, 'POST', 'createCollaboration', 201, async (request, actorId, introRequestId) => {
    assertUuid(introRequestId, 'introRequestId')
    const body = await readObject(request, ['title', 'milestones'])
    return dependencies.outcomes.createCollaboration({ actorId, introRequestId, title: readString(body, 'title', 1, 160), milestones: readStringArray(body, 'milestones', 1, 20, 200) })
  })
}

export function completeMilestoneHandler(dependencies: Dependencies) {
  return mutation(dependencies, 'PATCH', 'completeMilestone', 200, async (_request, actorId, collaborationId, milestoneId) => {
    assertUuid(collaborationId, 'collaborationId'); assertUuid(milestoneId, 'milestoneId')
    return dependencies.outcomes.completeMilestone({ actorId, collaborationId, milestoneId })
  })
}

export function requestOutcomeVerificationHandler(dependencies: Dependencies) {
  return mutation(dependencies, 'POST', 'requestOutcomeVerification', 201, async (request, actorId, collaborationId) => {
    assertUuid(collaborationId, 'collaborationId')
    const body = await readObject(request, ['evidence'])
    return dependencies.outcomes.requestVerification({ actorId, collaborationId, evidence: readString(body, 'evidence', 1, 2000) })
  })
}

export function resolveOutcomeVerificationHandler(dependencies: Dependencies) {
  return mutation(dependencies, 'PATCH', 'resolveOutcomeVerification', 200, async (request, actorId, verificationId) => {
    assertUuid(verificationId, 'verificationId')
    const body = await readObject(request, ['decision'])
    const decision = readString(body, 'decision', 1, 20)
    if (decision !== 'confirmed' && decision !== 'disputed') throw new HttpError(400, 'invalid_request', 'decision must be confirmed or disputed', 'decision')
    return dependencies.outcomes.resolveVerification({ actorId, verificationId, decision: decision as VerificationDecision })
  })
}

export function listTrustSignalsHandler(dependencies: Pick<Dependencies, 'sessions' | 'outcomes' | 'requestId'>) {
  return async (request: Request): Promise<Response> => {
    const requestId = dependencies.requestId?.() ?? crypto.randomUUID()
    try {
      if (request.method !== 'GET') throw new HttpError(405, 'method_not_allowed', 'Method not allowed')
      const session = await requireSession(request, dependencies.sessions)
      return Response.json({ items: await dependencies.outcomes.listTrustSignals(session.userId) })
    } catch (error) { return problem(error, requestId) }
  }
}

function mutation(
  dependencies: Dependencies,
  method: string,
  operation: string,
  successStatus: number,
  action: (request: Request, actorId: string, ...ids: string[]) => Promise<unknown>,
) {
  return async (request: Request, ...ids: string[]): Promise<Response> => {
    const requestId = dependencies.requestId?.() ?? crypto.randomUUID()
    try {
      if (request.method !== method) throw new HttpError(405, 'method_not_allowed', 'Method not allowed')
      const session = await requireSession(request, dependencies.sessions)
      requireCsrf(request, session)
      const key = requireIdempotencyKey(request)
      const clone = request.clone()
      const fingerprint = JSON.stringify({ ids, body: await clone.text() })
      const result = await dependencies.idempotency.run(session.userId, operation, key, fingerprint, () => action(request, session.userId, ...ids))
      return Response.json(result, { status: successStatus })
    } catch (error) { return problem(error, requestId) }
  }
}

async function readObject(request: Request, allowed: string[]): Promise<Record<string, unknown>> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new HttpError(415, 'unsupported_media_type', 'Content-Type must be application/json')
  try {
    const value: unknown = await request.json()
    if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error()
    const object = value as Record<string, unknown>
    const unexpected = Object.keys(object).find(key => !allowed.includes(key))
    if (unexpected) throw new HttpError(400, 'invalid_request', `Unexpected field: ${unexpected}`, unexpected)
    return object
  } catch (error) {
    if (error instanceof HttpError) throw error
    throw new HttpError(400, 'invalid_json', 'Request body must be a JSON object')
  }
}

function readString(value: Record<string, unknown>, field: string, minimum: number, maximum: number): string {
  const candidate = value[field]
  if (typeof candidate !== 'string' || candidate.trim().length < minimum || candidate.length > maximum) throw new HttpError(400, 'invalid_request', `${field} must contain ${minimum} to ${maximum} characters`, field)
  return candidate.trim()
}
function readStringArray(value: Record<string, unknown>, field: string, minimum: number, maximum: number, itemMaximum: number): string[] {
  const candidate = value[field]
  if (!Array.isArray(candidate) || candidate.length < minimum || candidate.length > maximum || candidate.some(item => typeof item !== 'string' || !item.trim() || item.length > itemMaximum)) throw new HttpError(400, 'invalid_request', `${field} must contain ${minimum} to ${maximum} non-empty strings`, field)
  return candidate.map(item => (item as string).trim())
}
function assertUuid(value: string, field: string): void { if (!uuid.test(value)) throw new HttpError(400, 'invalid_request', `${field} must be a UUID`, field) }
function problem(error: unknown, requestId: string): Response {
  const mapped = error instanceof HttpError ? error : error instanceof IdempotencyConflictError ? new HttpError(409, 'idempotency_conflict', error.message) : error instanceof ApplicationError ? new HttpError(error.code === 'forbidden' ? 403 : error.code === 'not_found' ? 404 : 409, error.code, error.message) : new HttpError(500, 'internal_error', 'An unexpected error occurred')
  return Response.json({ code: mapped.code, message: mapped.message, ...(mapped.field ? { field: mapped.field } : {}), requestId }, { status: mapped.status, headers: { 'content-type': 'application/problem+json' } })
}