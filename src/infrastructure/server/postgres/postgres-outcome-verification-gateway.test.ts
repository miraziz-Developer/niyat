import { describe, expect, it, vi } from 'vitest'
import type { SqlDatabase, SqlExecutor, SqlResult } from '../ports'
import { PostgresOutcomeVerificationGateway } from './postgres-outcome-verification-gateway'

const actor = '00000000-0000-4000-8000-000000000001'
const other = '00000000-0000-4000-8000-000000000002'
const collaborationId = '00000000-0000-4000-8000-000000000003'
const verificationId = '00000000-0000-4000-8000-000000000004'
const base = { id: collaborationId, intro_request_id: '00000000-0000-4000-8000-000000000005', creator_id: actor, counterparty_id: other, title: 'Sprint', created_at: '2030-01-01T00:00:00Z' }

function database(results: SqlResult<Record<string, unknown>>[]) {
  const query = vi.fn(async (_text: string, _values?: readonly unknown[]) => results.shift() ?? { rows: [], rowCount: 0 })
  return { value: { transaction: work => work({ query } as SqlExecutor) } as SqlDatabase, query }
}

describe('PostgresOutcomeVerificationGateway', () => {
  it('moves the collaboration to pending after inserting evidence', async () => {
    const verification = { id: verificationId, collaboration_id: collaborationId, requester_id: actor, evidence: 'Demo', status: 'pending', requested_at: '2030-01-02T00:00:00Z', resolved_at: null, resolved_by: null }
    const db = database([{ rows: [], rowCount: 1 }, { rows: [{ ...base, status: 'outcome-ready' }], rowCount: 1 }, { rows: [verification], rowCount: 1 }, { rows: [{ ...base, status: 'verification-pending' }], rowCount: 1 }])
    const result = await new PostgresOutcomeVerificationGateway(db.value).requestVerification({ actorId: actor, collaborationId, evidence: 'Demo' })
    expect(result.collaboration.status).toBe('verification-pending')
    expect(db.query.mock.calls[0][1]).toEqual([actor])
    expect(db.query.mock.calls[2][1]).toEqual([collaborationId, actor, 'Demo'])
  })

  it('prevents the requester from confirming their own outcome before mutation', async () => {
    const verification = { id: verificationId, collaboration_id: collaborationId, requester_id: actor, evidence: 'Demo', status: 'pending', requested_at: '2030-01-02T00:00:00Z', resolved_at: null, resolved_by: null }
    const db = database([{ rows: [], rowCount: 1 }, { rows: [verification], rowCount: 1 }, { rows: [{ ...base, status: 'verification-pending' }], rowCount: 1 }])
    await expect(new PostgresOutcomeVerificationGateway(db.value).resolveVerification({ actorId: actor, verificationId, decision: 'confirmed' })).rejects.toMatchObject({ code: 'forbidden' })
    expect(db.query).toHaveBeenCalledTimes(3)
  })

  it('atomically confirms and creates a trust signal for the requester', async () => {
    const verification = { id: verificationId, collaboration_id: collaborationId, requester_id: actor, evidence: 'Demo', status: 'pending', requested_at: '2030-01-02T00:00:00Z', resolved_at: null, resolved_by: null }
    const resolved = { ...verification, status: 'confirmed', resolved_at: '2030-01-03T00:00:00Z', resolved_by: other }
    const signal = { id: 'signal', collaboration_id: collaborationId, verification_id: verificationId, subject_id: actor, attester_id: other, label: 'Sprint', issued_at: '2030-01-03T00:00:00Z' }
    const db = database([{ rows: [], rowCount: 1 }, { rows: [verification], rowCount: 1 }, { rows: [{ ...base, status: 'verification-pending' }], rowCount: 1 }, { rows: [resolved], rowCount: 1 }, { rows: [{ ...base, status: 'verified' }], rowCount: 1 }, { rows: [signal], rowCount: 1 }])
    const result = await new PostgresOutcomeVerificationGateway(db.value).resolveVerification({ actorId: other, verificationId, decision: 'confirmed' })
    expect(result.trustSignal).toMatchObject({ subjectId: actor, attesterId: other })
    expect(db.query.mock.calls[5][1]).toEqual([collaborationId, verificationId, actor, other, 'Sprint'])
  })
})