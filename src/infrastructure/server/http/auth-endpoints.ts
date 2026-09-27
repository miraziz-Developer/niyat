import { normalizeEmail, type ManageMagicLinks } from '../../../application/auth/magic-link'
import type { CreatedSession } from '../ports'
import type { RateLimiter } from './rate-limiter'
import { problem, readObject, readString } from './request-validation'
import { HttpError } from './security'

export const clientIpHeader = 'x-niyat-client-ip'

export type AuthDependencies = {
  magicLinks: ManageMagicLinks<CreatedSession>
  limiter: RateLimiter
  /** When set, sign-in POSTs must come from this origin; blocks login CSRF from other sites. */
  allowedOrigin?: string
  requestId?: () => string
}

/** Unauthenticated sign-in routes. Returns null for any other path so the authenticated router can handle it. */
export function createAuthHandler(dependencies: AuthDependencies) {
  return async (request: Request, pathname: string): Promise<Response | null> => {
    if (pathname !== '/v1/auth/magic-link' && pathname !== '/v1/auth/magic-link/verify') return null
    const requestId = dependencies.requestId?.() ?? crypto.randomUUID()
    try {
      if (request.method !== 'POST') throw new HttpError(405, 'method_not_allowed', 'Method not allowed')
      if (dependencies.allowedOrigin && request.headers.get('origin') !== dependencies.allowedOrigin) throw new HttpError(403, 'invalid_origin', 'Request origin is not allowed')
      const ip = request.headers.get(clientIpHeader) ?? 'unknown'
      if (!dependencies.limiter.allow(`${pathname}:${ip}`)) throw new HttpError(429, 'rate_limited', 'Too many attempts; try again later')

      if (pathname === '/v1/auth/magic-link') {
        const body = await readObject(request, ['email'])
        const email = readString(body, 'email', 3, 254)
        if (!normalizeEmail(email)) throw new HttpError(400, 'invalid_request', 'email must be a valid address', 'email')
        await dependencies.magicLinks.request(email)
        // Same answer whether or not the address is invited.
        return Response.json({ status: 'sent' }, { status: 202 })
      }
      const body = await readObject(request, ['token'])
      const created = await dependencies.magicLinks.verify(readString(body, 'token', 1, 256))
      return Response.json(created.session, { status: 200, headers: { 'set-cookie': created.cookie } })
    } catch (error) {
      return problem(error, requestId)
    }
  }
}
