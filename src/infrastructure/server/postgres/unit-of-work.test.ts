import type { Pool } from 'pg'
import { describe, expect, it, vi } from 'vitest'
import { IdempotencyConflictError } from '../ports'
import { PgDatabase } from './pg-database'
import { PostgresIdempotencyStore } from './postgres-idempotency-store'

function fakePool(stored: { fingerprint: string; response: unknown } | null = null) {
  const statements: string[] = []
  const client = {
    query: vi.fn(async (text: string) => {
      statements.push(text.trim().split(/\s+/).slice(0, 3).join(' ').replace(/\(.*$/, ''))
      if (text.includes('FROM idempotency_records')) return { rows: stored ? [stored] : [], rowCount: stored ? 1 : 0 }
      return { rows: [], rowCount: 1 }
    }),
    release: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  }
  const pool = { connect: vi.fn(async () => client) } as unknown as Pool
  return { pool, client, statements }
}

describe('PostgreSQL unit of work', () => {
  it('runs the business action and its idempotency record in one transaction', async () => {
    const { pool, statements } = fakePool()
    const database = new PgDatabase(pool)
    const result = await new PostgresIdempotencyStore(database).run('actor', 'op', 'key-key-key-key-1', 'fp', () =>
      database.transaction(async transaction => { await transaction.query('UPDATE business SET x = 1'); return { ok: true } }))
    expect(result).toEqual({ ok: true })
    expect(pool.connect).toHaveBeenCalledOnce()
    expect(statements).toEqual(['BEGIN', 'SELECT pg_advisory_xact_lock', 'SELECT fingerprint, response', 'UPDATE business SET', 'INSERT INTO idempotency_records', 'COMMIT'])
  })

  it('rolls back the business change when the action fails', async () => {
    const { pool, statements } = fakePool()
    const database = new PgDatabase(pool)
    await expect(new PostgresIdempotencyStore(database).run('actor', 'op', 'key-key-key-key-1', 'fp', () =>
      database.transaction(async transaction => { await transaction.query('UPDATE business SET x = 1'); throw new Error('boom') }))).rejects.toThrow('boom')
    expect(statements.at(-1)).toBe('ROLLBACK')
    expect(statements).not.toContain('INSERT INTO idempotency_records')
  })

  it('replays a stored response and rejects a different fingerprint without running the action', async () => {
    const action = vi.fn()
    const replay = new PostgresIdempotencyStore(new PgDatabase(fakePool({ fingerprint: 'fp', response: { id: 1 } }).pool))
    await expect(replay.run('actor', 'op', 'key-key-key-key-1', 'fp', action)).resolves.toEqual({ id: 1 })
    await expect(replay.run('actor', 'op', 'key-key-key-key-1', 'other', action)).rejects.toBeInstanceOf(IdempotencyConflictError)
    expect(action).not.toHaveBeenCalled()
  })
})
