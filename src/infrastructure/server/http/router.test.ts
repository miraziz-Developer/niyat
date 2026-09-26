import { describe, expect, it, vi } from 'vitest'
import { ManageIntents, type IntentGateway } from '../../../application/intents/intent'
import { ManageIntroRequests, type IntroRequestGateway } from '../../../application/intros/intro-request'
import { ManageOutcomeVerifications, type OutcomeVerificationGateway } from '../../../application/outcomes/server-outcome-verification'
import { ManageProfiles, type ProfileGateway } from '../../../application/profiles/profile'
import { MemoryIdempotencyStore } from '../memory-idempotency-store'
import type { SessionResolver } from '../ports'
import { createApiRouter } from './router'

const actorId = '00000000-0000-4000-8000-000000000001'
const resourceId = '00000000-0000-4000-8000-000000000002'
const sessions: SessionResolver = { resolve: vi.fn().mockResolvedValue({ userId: actorId, csrfToken: 'csrf', expiresAt: '2999-01-01T00:00:00Z' }) }

function createRouter(overrides: Partial<OutcomeVerificationGateway> = {}) {
  const intros: IntroRequestGateway = { create: vi.fn(), transition: vi.fn(), list: vi.fn().mockResolvedValue([]) }
  const outcomes: OutcomeVerificationGateway = { createCollaboration: vi.fn(), completeMilestone: vi.fn(), requestVerification: vi.fn(), resolveVerification: vi.fn(), listTrustSignals: vi.fn().mockResolvedValue([]), listCollaborations: vi.fn().mockResolvedValue([]), ...overrides }
  const profiles: ProfileGateway = { find: vi.fn().mockResolvedValue(null), upsert: vi.fn() }
  const intents: IntentGateway = { create: vi.fn(), find: vi.fn(), update: vi.fn(), remove: vi.fn(), list: vi.fn().mockResolvedValue({ items: [], page: { nextCursor: null } }) }
  const router = createApiRouter({ sessions, idempotency: new MemoryIdempotencyStore(), intros: new ManageIntroRequests(intros), outcomes: new ManageOutcomeVerifications(outcomes), profiles: new ManageProfiles(profiles), intents: new ManageIntents(intents) })
  return { router, intros, outcomes, profiles, intents }
}

describe('API router', () => {
  it('serves authenticated session and workspace reads', async () => {
    const { router, intros, outcomes } = createRouter()
    expect(await (await router(new Request('https://niyat.test/v1/session'))).json()).toMatchObject({ userId: actorId, csrfToken: 'csrf' })
    expect((await router(new Request('https://niyat.test/v1/intro-requests'))).status).toBe(200)
    expect((await router(new Request('https://niyat.test/v1/me/collaborations'))).status).toBe(200)
    expect(intros.list).toHaveBeenCalledWith(actorId)
    expect(outcomes.listCollaborations).toHaveBeenCalledWith(actorId)
  })

  it('dispatches the contract milestone completion route', async () => {
    const completeMilestone = vi.fn().mockResolvedValue({ id: resourceId })
    const { router } = createRouter({ completeMilestone })
    const response = await router(new Request(`https://niyat.test/v1/collaborations/${resourceId}/milestones/${resourceId}/complete`, { method: 'PATCH', headers: { 'X-CSRF-Token': 'csrf', 'Idempotency-Key': '1234567890abcdef' } }))
    expect(response.status).toBe(200)
    expect(completeMilestone).toHaveBeenCalledWith({ actorId, collaborationId: resourceId, milestoneId: resourceId })
  })

  it('dispatches profile and intent routes with the session actor', async () => {
    const { router, profiles, intents } = createRouter()
    expect((await router(new Request('https://niyat.test/v1/me/profile'))).status).toBe(404)
    expect(profiles.find).toHaveBeenCalledWith(actorId)
    expect(await (await router(new Request('https://niyat.test/v1/intents?limit=5'))).json()).toEqual({ items: [], page: { nextCursor: null } })
    expect(intents.list).toHaveBeenCalledWith({ actorId, cursor: undefined, limit: 5 })
    expect((await router(new Request(`https://niyat.test/v1/intents/${resourceId}`, { method: 'PUT' }))).status).toBe(405)
  })
})
