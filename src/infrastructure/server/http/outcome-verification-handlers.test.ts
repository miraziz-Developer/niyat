import { describe, expect, it, vi } from 'vitest'
import { ApplicationError } from '../../../application/intros/intro-request'
import { ManageOutcomeVerifications, type OutcomeVerificationGateway } from '../../../application/outcomes/server-outcome-verification'
import { MemoryIdempotencyStore } from '../memory-idempotency-store'
import type { SessionResolver } from '../ports'
import { createCollaborationHandler, listTrustSignalsHandler, resolveOutcomeVerificationHandler } from './outcome-verification-handlers'

const actorId = '00000000-0000-4000-8000-000000000001'
const resourceId = '00000000-0000-4000-8000-000000000002'
const csrf = 'csrf-secret'
const sessions: SessionResolver = { resolve: vi.fn().mockResolvedValue({ userId: actorId, csrfToken: csrf, expiresAt: '2999-01-01T00:00:00Z' }) }
const headers = { 'content-type': 'application/json', 'X-CSRF-Token': csrf, 'Idempotency-Key': 'idempotency-key-1' }

function gateway(overrides: Partial<OutcomeVerificationGateway> = {}): OutcomeVerificationGateway {
  return { createCollaboration: vi.fn(), completeMilestone: vi.fn(), requestVerification: vi.fn(), resolveVerification: vi.fn(), listTrustSignals: vi.fn(), listCollaborations: vi.fn(), ...overrides }
}
function deps(value: OutcomeVerificationGateway) { return { sessions, idempotency: new MemoryIdempotencyStore(), outcomes: new ManageOutcomeVerifications(value), requestId: () => 'request-id' } }
function request(method: string, body?: unknown) { return new Request('https://api.niyat.test/v1/resource', { method, ...(body === undefined ? {} : { body: JSON.stringify(body), headers }) }) }

describe('outcome verification HTTP handlers', () => {
  it('strictly validates create payload and injects the session actor', async () => {
    const createCollaboration = vi.fn().mockResolvedValue({ id: resourceId })
    const handler = createCollaborationHandler(deps(gateway({ createCollaboration })))
    const spoofed = await handler(request('POST', { title: 'Sprint', milestones: ['Demo'], actorId: 'spoofed' }), resourceId)
    expect(spoofed.status).toBe(400)
    const accepted = await handler(request('POST', { title: ' Sprint ', milestones: [' Demo '] }), resourceId)
    expect(accepted.status).toBe(201)
    expect(createCollaboration).toHaveBeenCalledWith({ actorId, introRequestId: resourceId, title: 'Sprint', milestones: ['Demo'] })
  })

  it('replays an idempotent resolution and maps authorization errors', async () => {
    const resolveVerification = vi.fn().mockResolvedValue({ verification: { id: resourceId } })
    const handler = resolveOutcomeVerificationHandler(deps(gateway({ resolveVerification })))
    expect((await handler(request('PATCH', { decision: 'confirmed' }), resourceId)).status).toBe(200)
    expect((await handler(request('PATCH', { decision: 'confirmed' }), resourceId)).status).toBe(200)
    expect(resolveVerification).toHaveBeenCalledOnce()

    const denied = resolveOutcomeVerificationHandler(deps(gateway({ resolveVerification: vi.fn().mockRejectedValue(new ApplicationError('forbidden', 'The requester cannot verify their own outcome')) })))
    const response = await denied(request('PATCH', { decision: 'confirmed' }), resourceId)
    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ code: 'forbidden', requestId: 'request-id' })
  })

  it('lists only signals selected by the authenticated gateway query', async () => {
    const listTrustSignals = vi.fn().mockResolvedValue([{ id: 'signal' }])
    const response = await listTrustSignalsHandler(deps(gateway({ listTrustSignals })))(request('GET'))
    expect(response.status).toBe(200)
    expect(listTrustSignals).toHaveBeenCalledWith(actorId)
  })
})