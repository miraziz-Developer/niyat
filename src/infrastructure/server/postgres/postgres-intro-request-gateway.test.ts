import { describe, expect, it, vi } from 'vitest'
import { ApplicationError } from '../../../application/intros/intro-request'
import type { SqlDatabase, SqlExecutor, SqlResult } from '../ports'
import { PostgresIntroRequestGateway } from './postgres-intro-request-gateway'

const actorId = '00000000-0000-4000-8000-000000000001'
const matchId = '00000000-0000-4000-8000-000000000002'
const receiverId = '00000000-0000-4000-8000-000000000003'
const introId = '00000000-0000-4000-8000-000000000004'

function database(results: SqlResult<Record<string, unknown>>[]) {
  const query = vi.fn(async (_text: string, _values?: readonly unknown[]) => results.shift() ?? { rows: [], rowCount: 0 })
  const value: SqlDatabase = { transaction: work => work({ query } as SqlExecutor) }
  return { value, query }
}

const ok = { rows: [], rowCount: 1 }
function row(status = 'pending', counterpart: Record<string, unknown> = {}) {
  return {
    id: introId, match_id: matchId, sender_id: actorId, receiver_id: receiverId,
    scope: 'Call', message: '', status, expires_at: '2030-01-08T00:00:00Z', created_at: '2030-01-01T00:00:00Z', ...counterpart,
  }
}

describe('PostgresIntroRequestGateway', () => {
  it('checks eligibility in the actor context, inserts, and retires the match from the eligible pool', async () => {
    const db = database([ok, { rows: [{ receiver_id: receiverId }], rowCount: 1 }, { rows: [{ id: introId }], rowCount: 1 }, ok, ok, { rows: [row()], rowCount: 1 }])
    const result = await new PostgresIntroRequestGateway(db.value).create({ actorId, matchId, scope: 'Call', message: '' })
    expect(result).toMatchObject({ matchId, senderId: actorId, receiverId, status: 'pending', counterpart: null })
    expect(db.query.mock.calls[0]).toEqual([expect.stringContaining("set_config('app.user_id'"), [actorId]])
    expect(db.query.mock.calls[1]).toEqual([expect.stringContaining('eligible_intro_receiver'), [matchId, actorId]])
    expect(db.query.mock.calls[2][1]).toEqual([matchId, actorId, receiverId, 'Call', ''])
    expect(db.query.mock.calls[3][0]).toContain("status = 'intro_requested'")
    expect(db.query.mock.calls[4]).toEqual([expect.stringContaining('INSERT INTO notification_outbox'), [receiverId, 'intro_requested', introId]])
  })

  it('denies creation when the authorization function returns no receiver', async () => {
    const db = database([ok, { rows: [{ receiver_id: null }], rowCount: 1 }])
    await expect(new PostgresIntroRequestGateway(db.value).create({ actorId, matchId, scope: 'Call', message: '' }))
      .rejects.toEqual(new ApplicationError('forbidden', 'Match is not eligible for an intro request'))
    expect(db.query).toHaveBeenCalledTimes(2)
  })

  it('checks actor policy before updating a transition', async () => {
    const db = database([ok, { rows: [row()], rowCount: 1 }])
    await expect(new PostgresIntroRequestGateway(db.value).transition({ actorId, requestId: introId, status: 'accepted' }))
      .rejects.toMatchObject({ code: 'forbidden' })
    expect(db.query).toHaveBeenCalledTimes(2)
  })

  it('refuses to act on an expired request', async () => {
    const db = database([ok, { rows: [row('expired')], rowCount: 1 }])
    await expect(new PostgresIntroRequestGateway(db.value).transition({ actorId, requestId: introId, status: 'cancelled' }))
      .rejects.toMatchObject({ code: 'conflict', message: 'This intro request has expired' })
  })

  it('connects the match on acceptance and reveals the counterpart it returns', async () => {
    const incoming = { ...row(), sender_id: receiverId, receiver_id: actorId }
    const counterpart = { counterpart_user_id: receiverId, counterpart_intent_id: matchId, counterpart_title: 'Growth', counterpart_offers: ['growth'], counterpart_needs: [], counterpart_display_name: 'Aziza', counterpart_verification_level: 1 }
    const db = database([ok, { rows: [incoming], rowCount: 1 }, ok, ok, ok, { rows: [{ ...incoming, status: 'accepted', ...counterpart }], rowCount: 1 }])
    const result = await new PostgresIntroRequestGateway(db.value).transition({ actorId, requestId: introId, status: 'accepted' })
    expect(db.query.mock.calls[3]).toEqual([expect.stringContaining("status = 'connected'"), [matchId]])
    expect(db.query.mock.calls[4][1]).toEqual([receiverId, 'intro_accepted', introId])
    expect(result.counterpart).toEqual({ userId: receiverId, displayName: 'Aziza', verificationLevel: 1, intent: { id: matchId, title: 'Growth', offers: ['growth'], needs: [] } })
  })
})
