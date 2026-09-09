import type { Session, SessionResolver } from '../ports'

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly field?: string,
  ) {
    super(message)
    this.name = 'HttpError'
  }
}

export async function requireSession(request: Request, resolver: SessionResolver): Promise<Session> {
  const session = await resolver.resolve(request)
  const expiresAt = session ? Date.parse(session.expiresAt) : Number.NaN
  if (!session || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    throw new HttpError(401, 'unauthorized', 'A valid session is required')
  }
  return session
}

export function requireCsrf(request: Request, session: Session): void {
  const supplied = request.headers.get('X-CSRF-Token') ?? ''
  if (!constantTimeEqual(supplied, session.csrfToken)) {
    throw new HttpError(403, 'invalid_csrf_token', 'CSRF token is missing or invalid')
  }
}

export function requireIdempotencyKey(request: Request): string {
  const key = request.headers.get('Idempotency-Key') ?? ''
  if (key.length < 16 || key.length > 128) {
    throw new HttpError(400, 'invalid_idempotency_key', 'Idempotency-Key must contain 16 to 128 characters', 'Idempotency-Key')
  }
  return key
}

function constantTimeEqual(left: string, right: string): boolean {
  let difference = left.length ^ right.length
  const length = Math.max(left.length, right.length)
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0)
  }
  return difference === 0
}