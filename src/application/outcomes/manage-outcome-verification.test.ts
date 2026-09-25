import { describe, expect, it } from 'vitest'
import type { Collaboration } from '../../domain/model/entities'
import { requestOutcomeVerification, resolveOutcomeVerification } from './manage-outcome-verification'

const outcomeReady: Collaboration = {
  id: 'collaboration-1',
  introRequestId: 'intro-1',
  personId: 'person-1',
  title: 'Prototype sprint',
  status: 'outcome-ready',
  startedAt: '1970-01-01T00:00:00.000Z',
  milestones: [{ id: 'milestone-1', title: 'Demo', status: 'completed', completedAt: '1970-01-01T00:00:01.000Z' }],
}

describe('outcome verification lifecycle', () => {
  it('requests verification with normalized evidence', () => {
    const result = requestOutcomeVerification(outcomeReady, '  Ishlaydigan prototip topshirildi  ', 2_000)

    expect(result.collaboration.status).toBe('verification-pending')
    expect(result.verification).toMatchObject({
      id: 'verification-collaboration-1-2000',
      collaborationId: 'collaboration-1',
      evidence: 'Ishlaydigan prototip topshirildi',
      status: 'pending',
      requestedAt: '1970-01-01T00:00:02.000Z',
    })
  })

  it('requires an outcome-ready collaboration and evidence', () => {
    expect(() => requestOutcomeVerification({ ...outcomeReady, status: 'active' }, 'Dalil', 0)).toThrow('outcome-ready')
    expect(() => requestOutcomeVerification(outcomeReady, '  ', 0)).toThrow('evidence')
  })

  it('confirmation verifies the outcome and emits one trust signal', () => {
    const requested = requestOutcomeVerification(outcomeReady, 'Demo topshirildi', 1)
    const resolved = resolveOutcomeVerification(requested.collaboration, requested.verification, 'confirmed', 2)

    expect(resolved.collaboration.status).toBe('verified')
    expect(resolved.verification).toMatchObject({ status: 'confirmed', resolvedAt: '1970-01-01T00:00:00.002Z' })
    expect(resolved.trustSignal).toMatchObject({
      id: 'trust-verification-collaboration-1-1',
      verificationId: requested.verification.id,
      label: 'Prototype sprint',
    })
  })

  it('a dispute returns the collaboration for evidence revision without trust', () => {
    const requested = requestOutcomeVerification(outcomeReady, 'Demo topshirildi', 1)
    const resolved = resolveOutcomeVerification(requested.collaboration, requested.verification, 'disputed', 2)

    expect(resolved.collaboration.status).toBe('outcome-ready')
    expect(resolved.verification.status).toBe('disputed')
    expect(resolved.trustSignal).toBeUndefined()

    const resubmitted = requestOutcomeVerification(resolved.collaboration, 'Yangilangan demo', 3)
    expect(resubmitted.verification.id).not.toBe(requested.verification.id)
  })

  it('rejects mismatched and terminal verification resolution', () => {
    const requested = requestOutcomeVerification(outcomeReady, 'Demo topshirildi', 1)
    expect(() => resolveOutcomeVerification({ ...requested.collaboration, id: 'other' }, requested.verification, 'confirmed', 2)).toThrow('belong')

    const resolved = resolveOutcomeVerification(requested.collaboration, requested.verification, 'confirmed', 2)
    expect(() => resolveOutcomeVerification(resolved.collaboration, resolved.verification, 'confirmed', 3)).toThrow('pending')
  })
})