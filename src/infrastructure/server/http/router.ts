import type { ManageIntents } from '../../../application/intents/intent'
import type { ManageIntroRequests } from '../../../application/intros/intro-request'
import type { ManageOutcomeVerifications } from '../../../application/outcomes/server-outcome-verification'
import type { ManageProfiles } from '../../../application/profiles/profile'
import type { IdempotencyStore, SessionResolver } from '../ports'
import { createIntroRequestHandler, transitionIntroRequestHandler } from './intro-request-handlers'
import { intentCollectionHandler, intentHandler, profileHandler } from './profile-intent-handlers'
import { completeMilestoneHandler, createCollaborationHandler, listTrustSignalsHandler, requestOutcomeVerificationHandler, resolveOutcomeVerificationHandler } from './outcome-verification-handlers'
import { HttpError, requireSession } from './security'

type Dependencies = { sessions: SessionResolver; idempotency: IdempotencyStore; intros: ManageIntroRequests; outcomes: ManageOutcomeVerifications; profiles: ManageProfiles; intents: ManageIntents }

export function createApiRouter(dependencies: Dependencies) {
  const createIntro = createIntroRequestHandler(dependencies)
  const transitionIntro = transitionIntroRequestHandler(dependencies)
  const createCollaboration = createCollaborationHandler(dependencies)
  const completeMilestone = completeMilestoneHandler(dependencies)
  const requestVerification = requestOutcomeVerificationHandler(dependencies)
  const resolveVerification = resolveOutcomeVerificationHandler(dependencies)
  const listTrust = listTrustSignalsHandler(dependencies)
  const profile = profileHandler(dependencies)
  const intentCollection = intentCollectionHandler(dependencies)
  const intent = intentHandler(dependencies)

  return async (request: Request): Promise<Response> => {
    const { pathname } = new URL(request.url)
    let match: RegExpMatchArray | null
    if (pathname === '/v1/health' && request.method === 'GET') return Response.json({ status: 'ok' })
    if (pathname === '/v1/session' && request.method === 'GET') {
      try {
        const session = await requireSession(request, dependencies.sessions)
        return Response.json({ userId: session.userId, csrfToken: session.csrfToken, expiresAt: session.expiresAt })
      } catch (error) { return problem(error) }
    }
    if (pathname === '/v1/me/collaborations' && request.method === 'GET') {
      try {
        const session = await requireSession(request, dependencies.sessions)
        return Response.json({ items: await dependencies.outcomes.listCollaborations(session.userId) })
      } catch (error) { return problem(error) }
    }
    if (pathname === '/v1/intro-requests' && request.method === 'GET') {
      try {
        const session = await requireSession(request, dependencies.sessions)
        return Response.json({ items: await dependencies.intros.list(session.userId) })
      } catch (error) { return problem(error) }
    }
    if (pathname === '/v1/me/trust-signals') return listTrust(request)
    if (pathname === '/v1/me/profile') return profile(request)
    if (pathname === '/v1/intents') return intentCollection(request)
    if ((match = pathname.match(/^\/v1\/intents\/([^/]+)$/))) return intent(request, match[1])
    if ((match = pathname.match(/^\/v1\/matches\/([^/]+)\/intro-requests$/))) return createIntro(request, match[1])
    if ((match = pathname.match(/^\/v1\/intro-requests\/([^/]+)\/collaboration$/))) return createCollaboration(request, match[1])
    if ((match = pathname.match(/^\/v1\/intro-requests\/([^/]+)$/))) return transitionIntro(request, match[1])
    if ((match = pathname.match(/^\/v1\/collaborations\/([^/]+)\/milestones\/([^/]+)\/complete$/))) return completeMilestone(request, match[1], match[2])
    if ((match = pathname.match(/^\/v1\/collaborations\/([^/]+)\/outcome-verifications$/))) return requestVerification(request, match[1])
    if ((match = pathname.match(/^\/v1\/outcome-verifications\/([^/]+)$/))) return resolveVerification(request, match[1])
    return problem(new HttpError(404, 'not_found', 'Route not found'))
  }
}

function problem(error: unknown): Response {
  const mapped = error instanceof HttpError ? error : new HttpError(500, 'internal_error', 'An unexpected error occurred')
  return Response.json({ code: mapped.code, message: mapped.message, requestId: crypto.randomUUID() }, { status: mapped.status, headers: { 'content-type': 'application/problem+json' } })
}