import { ApplicationError } from '../../../application/intros/intro-request'
import { IdempotencyConflictError } from '../ports'
import { HttpError } from './security'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function readObject(request: Request, allowed: string[], required: string[] = allowed): Promise<Record<string, unknown>> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new HttpError(415, 'unsupported_media_type', 'Content-Type must be application/json')
  let object: Record<string, unknown>
  try {
    const value: unknown = await request.json()
    if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error()
    object = value as Record<string, unknown>
  } catch {
    throw new HttpError(400, 'invalid_json', 'Request body must be a JSON object')
  }
  const unexpected = Object.keys(object).find(key => !allowed.includes(key))
  if (unexpected) throw new HttpError(400, 'invalid_request', `Unexpected field: ${unexpected}`, unexpected)
  const missing = required.find(key => !(key in object))
  if (missing) throw new HttpError(400, 'invalid_request', `Missing field: ${missing}`, missing)
  return object
}

export function readString(value: Record<string, unknown>, field: string, minimum: number, maximum: number): string {
  const candidate = value[field]
  if (typeof candidate !== 'string' || candidate.trim().length < minimum || candidate.length > maximum) throw new HttpError(400, 'invalid_request', `${field} must contain ${minimum} to ${maximum} characters`, field)
  return candidate.trim()
}

export function readStringArray(value: Record<string, unknown>, field: string, minimum: number, maximum: number, itemMaximum: number): string[] {
  const candidate = value[field]
  if (!Array.isArray(candidate) || candidate.length < minimum || candidate.length > maximum || candidate.some(item => typeof item !== 'string' || !item.trim() || item.length > itemMaximum)) throw new HttpError(400, 'invalid_request', `${field} must contain ${minimum} to ${maximum} non-empty strings`, field)
  return candidate.map(item => (item as string).trim())
}

export function readEnum<T extends string>(value: Record<string, unknown>, field: string, allowed: readonly T[]): T {
  const candidate = value[field]
  if (typeof candidate !== 'string' || !allowed.includes(candidate as T)) throw new HttpError(400, 'invalid_request', `${field} must be one of: ${allowed.join(', ')}`, field)
  return candidate as T
}

export function assertUuid(value: string, field: string): void {
  if (!uuid.test(value)) throw new HttpError(400, 'invalid_request', `${field} must be a UUID`, field)
}

export function problem(error: unknown, requestId: string): Response {
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
