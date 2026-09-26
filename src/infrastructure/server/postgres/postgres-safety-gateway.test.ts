import { describe, expect, it, vi } from 'vitest'
import type { SqlDatabase, SqlExecutor, SqlResult } from '../ports'
import { PostgresSafetyGateway } from './postgres-safety-gateway'

const actorId = '00000000-0000-4000-8000-000000000001'
const otherId = '00000000-0000-4000-8000-000000000002'
const ok = { rows: [], rowCount: 1 }

function database(results: SqlResult<Record<string, unknown>>[]) {
  const query = vi.fn(async (_text: string, _values?: readonly unknown[]) => results.shift() ?? { rows: [], rowCount: 0 })
  const value: SqlDatabase = { transaction: work => work({ query } as SqlExecutor) }
  return { value, query }
}

describe('PostgresSafetyGateway', () => {
  it('records the block and closes pending intros between the pair', async () => {
    const db = database([ok, { rows: [{}], rowCount: 1 }, ok, ok])
    expect(await new PostgresSafetyGateway(db.value).block({ actorId, blockedUserId: otherId })).toBe(true)
    expect(db.query.mock.calls[2][1]).toEqual([actorId, otherId, null])
    expect(db.query.mock.calls[3][0]).toContain("status = 'pending'")
  })

  it('reports false for unknown users without writing', async () => {
    const db = database([ok, { rows: [], rowCount: 0 }])
    expect(await new PostgresSafetyGateway(db.value).block({ actorId, blockedUserId: otherId })).toBe(false)
    expect(db.query).toHaveBeenCalledTimes(2)
  })

  it('stops filing once the daily report limit is reached', async () => {
    const db = database([ok, ok, { rows: [{ count: 20 }], rowCount: 1 }])
    expect(await new PostgresSafetyGateway(db.value).report({ actorId, subjectType: 'user', subjectId: otherId, reasonCode: 'spam', details: '' }, 20)).toBeNull()
    expect(db.query).toHaveBeenCalledTimes(3)
  })

  it('files a report with an audit event that carries no free-text details', async () => {
    const db = database([ok, ok, { rows: [{ count: 0 }], rowCount: 1 }, { rows: [{ id: 'report' }], rowCount: 1 }, ok])
    const receipt = await new PostgresSafetyGateway(db.value).report({ actorId, subjectType: 'user', subjectId: otherId, reasonCode: 'spam', details: 'private words' }, 20)
    expect(receipt).toEqual({ id: 'report', status: 'open' })
    expect(db.query.mock.calls[4][1]).not.toContain('private words')
  })
})
