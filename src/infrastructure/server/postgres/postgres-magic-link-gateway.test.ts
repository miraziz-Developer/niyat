import { describe, expect, it, vi } from 'vitest'
import type { SqlDatabase, SqlExecutor, SqlResult } from '../ports'
import { PostgresMagicLinkGateway } from './postgres-magic-link-gateway'

const ok = { rows: [], rowCount: 1 }
function database(results: SqlResult<Record<string, unknown>>[]) {
  const query = vi.fn(async (_text: string, _values?: readonly unknown[]) => results.shift() ?? { rows: [], rowCount: 0 })
  return { value: { transaction: work => work({ query } as SqlExecutor) } as SqlDatabase, query }
}

describe('PostgresMagicLinkGateway', () => {
  it('issues nothing for an uninvited email and respects the hourly limit', async () => {
    const uninvited = database([ok, { rows: [{ eligible: false }], rowCount: 1 }])
    expect(await new PostgresMagicLinkGateway(uninvited.value).issue('x@y.uz', 'h', new Date(), 5)).toBe('not_eligible')
    const limited = database([ok, { rows: [{ eligible: true }], rowCount: 1 }, { rows: [{ count: 5 }], rowCount: 1 }])
    expect(await new PostgresMagicLinkGateway(limited.value).issue('x@y.uz', 'h', new Date(), 5)).toBe('rate_limited')
    expect(limited.query.mock.calls.some(([text]) => text.includes('INSERT'))).toBe(false)
  })

  it('returns null when the token is unknown, expired or already used', async () => {
    const db = database([{ rows: [], rowCount: 0 }])
    expect(await new PostgresMagicLinkGateway(db.value).consume('h')).toBeNull()
    expect(db.query).toHaveBeenCalledOnce()
  })

  it('signs in an existing active member and refuses a suspended one', async () => {
    const active = database([{ rows: [{ email_normalized: 'x@y.uz' }], rowCount: 1 }, ok, { rows: [{ user_id: 'u1', status: 'active' }], rowCount: 1 }, ok])
    expect(await new PostgresMagicLinkGateway(active.value).consume('h')).toEqual({ userId: 'u1' })
    const suspended = database([{ rows: [{ email_normalized: 'x@y.uz' }], rowCount: 1 }, ok, { rows: [{ user_id: 'u1', status: 'suspended' }], rowCount: 1 }])
    expect(await new PostgresMagicLinkGateway(suspended.value).consume('h')).toBeNull()
  })

  it('creates the account on the first sign-in of an invited email', async () => {
    const db = database([{ rows: [{ email_normalized: 'x@y.uz' }], rowCount: 1 }, ok, { rows: [], rowCount: 0 }, { rows: [{}], rowCount: 1 }, { rows: [{ id: 'new-user' }], rowCount: 1 }, ok, ok, ok])
    expect(await new PostgresMagicLinkGateway(db.value).consume('h')).toEqual({ userId: 'new-user' })
    expect(db.query.mock.calls[5][0]).toContain('INSERT INTO auth_identities')
    expect(db.query.mock.calls[6][0]).toContain('UPDATE invitations')
  })
})
