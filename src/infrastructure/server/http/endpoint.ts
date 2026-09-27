import type { IdempotencyStore, Session, SessionResolver } from '../ports'
import { assertUuid, problem } from './request-validation'
import { HttpError, requireCsrf, requireIdempotencyKey, requireSession } from './security'

export type EndpointDependencies = {
  sessions: SessionResolver
  idempotency: IdempotencyStore
  /** When present, mutations require the member to have accepted the current terms and confirmed 18+. */
  consentGate?: { hasAcceptedCurrent(actorId: string): Promise<boolean> }
  requestId?: () => string
}
export type Context = { request: Request; url: URL; session: Session; actorId: string; params: Record<string, string> }
export type Operation = (context: Context, dependencies: EndpointDependencies) => Promise<Response>
export type Methods = Partial<Record<'GET' | 'POST' | 'PATCH' | 'DELETE', Operation>>

/** Authenticated read: the actor always comes from the server session, never from input. */
export function read(run: (context: Context) => Promise<unknown>): Operation {
  return async context => Response.json(await run(context))
}

/** CSRF-protected, idempotent mutation. The fingerprint covers path params and the validated input. */
export function mutation<Input>(
  operation: string,
  status: 200 | 201 | 202 | 204,
  parse: (request: Request) => Promise<Input>,
  run: (context: Context, input: Input) => Promise<unknown>,
  options: { consentExempt?: boolean } = {},
): Operation {
  return async (context, dependencies) => {
    requireCsrf(context.request, context.session)
    const key = requireIdempotencyKey(context.request)
    if (!options.consentExempt && dependencies.consentGate && !await dependencies.consentGate.hasAcceptedCurrent(context.actorId)) {
      throw new HttpError(403, 'consent_required', 'Confirm you are 18+ and accept the current terms first')
    }
    const input = await parse(context.request)
    const fingerprint = JSON.stringify({ params: context.params, input })
    // Replay storage is JSON; `null` stands in for mutations without a response body.
    const result = await dependencies.idempotency.run(context.actorId, operation, key, fingerprint, async () => (await run(context, input)) ?? null)
    return status === 204 ? new Response(null, { status }) : Response.json(result, { status })
  }
}

export const noBody = async () => ({})

export function endpoint(dependencies: EndpointDependencies, methods: Methods) {
  return async (request: Request, params: Record<string, string> = {}): Promise<Response> => {
    const requestId = dependencies.requestId?.() ?? crypto.randomUUID()
    try {
      const operation = methods[request.method as keyof Methods]
      if (!operation) throw new HttpError(405, 'method_not_allowed', 'Method not allowed')
      for (const [name, value] of Object.entries(params)) assertUuid(value, name)
      const session = await requireSession(request, dependencies.sessions)
      return await operation({ request, url: new URL(request.url), session, actorId: session.userId, params }, dependencies)
    } catch (error) {
      return problem(error, requestId)
    }
  }
}
