import { describe, expect, it, vi } from 'vitest'
import { InvalidCursorError, type IntentInput } from '../../../application/intents/intent'
import type { SqlDatabase, SqlExecutor, SqlResult } from '../ports'
import { decodeCursor, encodeCursor, PostgresIntentGateway } from './postgres-intent-gateway'

const actorId = '00000000-0000-4000-8000-000000000001'
const intentId = '00000000-0000-4000-8000-000000000011'
const input: IntentInput = { title: 'Launch', outcome: 'Ship', offers: [], needs: [], topics: [], mode: 'online', horizon: 'now', visibility: 'matched', status: 'draft' }

function database(results: SqlResult<Record<string, unknown>>[]) {
  const query = vi.fn(async (_text: string, _values?: readonly unknown[]) => results.shift() ?? { rows: [], rowCount: 0 })
  const value: SqlDatabase = { transaction: work => work({ query } as SqlExecutor) }
  return { value, query }
}

function row(id = intentId, cursorAt = '2030-01-01T00:00:00.123456Z') {
  return { id, owner_id: actorId, ...input, created_at: '2030-01-01T00:00:00Z', updated_at: '2030-01-01T00:00:00Z', cursor_at: cursorAt }
}

describe('PostgresIntentGateway', () => {
  it('scopes creation to the actor inside a transaction-local RLS context', async () => {
    const db = database([{ rows: [], rowCount: 1 }, { rows: [row()], rowCount: 1 }])
    const created = await new PostgresIntentGateway(db.value).create({ actorId, input })
    expect(created).toMatchObject({ id: intentId, ownerId: actorId, status: 'draft' })
    expect(db.query.mock.calls[0]).toEqual([expect.stringContaining("set_config('app.user_id'"), [actorId]])
    expect(db.query.mock.calls[1][1]?.[0]).toBe(actorId)
  })

  it('refuses to delete intents with intro history before issuing a DELETE', async () => {
    const db = database([{ rows: [], rowCount: 1 }, { rows: [{ id: intentId }], rowCount: 1 }, { rows: [], rowCount: 0 }, { rows: [{ linked: true }], rowCount: 1 }])
    await expect(new PostgresIntentGateway(db.value).remove({ actorId, intentId })).rejects.toMatchObject({ code: 'conflict' })
    expect(db.query.mock.calls.some(([text]) => text.startsWith('DELETE'))).toBe(false)
    expect(db.query.mock.calls[2][0]).toContain('FOR UPDATE')
  })

  it('pages with a microsecond keyset cursor', async () => {
    const second = '00000000-0000-4000-8000-000000000012'
    const db = database([{ rows: [], rowCount: 1 }, { rows: [row(), row(second, '2029-12-31T00:00:00.000001Z')], rowCount: 2 }])
    const page = await new PostgresIntentGateway(db.value).list({ actorId, limit: 1 })
    expect(page.items.map(item => item.id)).toEqual([intentId])
    expect(decodeCursor(page.page.nextCursor ?? '')).toEqual({ updatedAt: '2030-01-01T00:00:00.123456Z', id: intentId })
    expect(db.query.mock.calls[1][1]).toEqual([actorId, null, null, 2])
  })

  it('rejects cursors it did not issue without touching the database', async () => {
    const db = database([])
    expect(() => decodeCursor(encodeCursor('2030-01-01', intentId))).toThrow(InvalidCursorError)
    await expect(new PostgresIntentGateway(db.value).list({ actorId, cursor: 'bogus', limit: 5 })).rejects.toBeInstanceOf(InvalidCursorError)
    expect(db.query).not.toHaveBeenCalled()
  })
})
