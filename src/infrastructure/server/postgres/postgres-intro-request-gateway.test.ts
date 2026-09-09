import { describe, expect, it, vi } from 'vitest'
import { ApplicationError } from '../../../application/intros/intro-request'
import type { SqlDatabase, SqlExecutor, SqlResult } from '../ports'
import { PostgresIntroRequestGateway } from './postgres-intro-request-gateway'

const actorId = '00000000-0000-4000-8000-000000000001'
const matchId = '00000000-0000-4000-8000-000000000002'
const receiverId = '00000000-0000-4000-8000-000000000003'

function database(results: SqlResult<Record<string, unknown>>[]) {
  const query = vi.fn(async (_text: string, _values?: readonly unknown[]) => results.shift() ?? { rows: [], rowCount: 0 })
  const value: SqlDatabase = { transaction: work => work({ query } as SqlExecutor) }
  return { value, query }
}

function row(status = 'pending') {
  return {
    id: '00000000-0000-4000-8000-000000000004', match_id: matchId, sender_id: actorId, receiver_id: receiverId,
    scope: 'Call', message: '', status, expires_at: '2030-01-08T00:00:00Z', created_at: '2030-01-01T00:00:00Z',
  }
}

describe('PostgresIntroRequestGateway', () => {
  it('sets transaction-local actor context before checking eligibility and inserting', async () => {
    const db = database([
      { rows: [], rowCount: 1 },
      { rows: [{ receiver_id: receiverId }], rowCount: 1 },
      { rows: [row()], rowCount: 1 },
    ])
    const result = await new PostgresIntroRequestGateway(db.value).create({ actorId, matchId, scope: 'Call', message: '' })
    expect(result).toMatchObject({ matchId, senderId: actorId, receiverId, status: 'pending' })
    expect(db.query.mock.calls[0]).toEqual([expect.stringContaining("set_config('app.user_id'"), [actorId]])
    expect(db.query.mock.calls[1]).toEqual([expect.stringContaining('eligible_intro_receiver'), [matchId, actorId]])
    expect(db.query.mock.calls[2][1]).toEqual([matchId, actorId, receiverId, 'Call', ''])
  })

  it('denies creation when the authorization function returns no receiver', async () => {
    const db = database([{ rows: [], rowCount: 1 }, { rows: [{ receiver_id: null }], rowCount: 1 }])
    await expect(new PostgresIntroRequestGateway(db.value).create({ actorId, matchId, scope: 'Call', message: '' }))
      .rejects.toEqual(new ApplicationError('forbidden', 'Match is not eligible for an intro request'))
    expect(db.query).toHaveBeenCalledTimes(2)
  })

  it('checks actor policy before updating a transition', async () => {
    const db = database([{ rows: [], rowCount: 1 }, { rows: [row()], rowCount: 1 }])
    await expect(new PostgresIntroRequestGateway(db.value).transition({ actorId, requestId: row().id, status: 'accepted' }))
      .rejects.toMatchObject({ code: 'forbidden' })
    expect(db.query).toHaveBeenCalledTimes(2)
  })
})