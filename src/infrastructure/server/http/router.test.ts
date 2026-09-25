import { describe, expect, it, vi } from 'vitest'
import { ManageIntroRequests, type IntroRequestGateway } from '../../../application/intros/intro-request'
import { ManageOutcomeVerifications, type OutcomeVerificationGateway } from '../../../application/outcomes/server-outcome-verification'
import { MemoryIdempotencyStore } from '../memory-idempotency-store'
import type { SessionResolver } from '../ports'
import { createApiRouter } from './router'

const actorId = '00000000-0000-4000-8000-000000000001'
const resourceId = '00000000-0000-4000-8000-000000000002'
const sessions: SessionResolver = { resolve: vi.fn().mockResolvedValue({ userId: actorId, csrfToken: 'csrf', expiresAt: '2999-01-01T00:00:00Z' }) }

function createRouter(overrides: Partial<OutcomeVerificationGateway> = {}) {
  const intros: IntroRequestGateway = { create: vi.fn(), transition: vi.fn(), list: vi.fn().mockResolvedValue([]) }
  const outcomes: OutcomeVerificationGateway = { createCollaboration: vi.fn(), completeMilestone: vi.fn(), requestVerification: vi.fn(), resolveVerification: vi.fn(), listTrustSignals: vi.fn().mockResolvedValue([]), listCollaborations: vi.fn().mockResolvedValue([]), ...overrides }
  return { router: createApiRouter({ sessions, idempotency: new MemoryIdempotencyStore(), intros: new ManageIntroRequests(intros), outcomes: new ManageOutcomeVerifications(outcomes) }), intros, outcomes }
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
})