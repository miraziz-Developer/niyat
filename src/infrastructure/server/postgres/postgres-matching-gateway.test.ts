import { describe, expect, it, vi } from 'vitest'
import { InvalidCursorError } from '../../../application/intents/intent'
import type { SqlDatabase, SqlExecutor, SqlResult } from '../ports'
import { decodeMatchCursor, encodeMatchCursor, PostgresMatchingGateway } from './postgres-matching-gateway'

const actorId = '00000000-0000-4000-8000-000000000001'
const lowIntent = '00000000-0000-4000-8000-00000000000a'
const highIntent = '00000000-0000-4000-8000-00000000000f'
const ok = { rows: [], rowCount: 1 }

function database(results: SqlResult<Record<string, unknown>>[]) {
  const query = vi.fn(async (_text: string, _values?: readonly unknown[]) => results.shift() ?? { rows: [], rowCount: 0 })
  const value: SqlDatabase = { transaction: work => work({ query } as SqlExecutor) }
  return { value, query }
}

describe('PostgresMatchingGateway', () => {
  it('stores pairs in canonical order with evidence relative to the left intent', async () => {
    const source = { id: highIntent, offers: ['engineering'], needs: ['design'], topics: ['ai'], mode: 'online' }
    const candidate = { id: lowIntent, offers: ['design'], needs: ['engineering'], topics: ['ai'], mode: 'online' }
    const db = database([ok, { rows: [source], rowCount: 1 }, { rows: [candidate], rowCount: 1 }, ok, ok])
    expect(await new PostgresMatchingGateway(db.value).refresh(actorId, highIntent)).toBe(true)
    const [lefts, rights, scores, evidence] = db.query.mock.calls[3][1] as [string[], string[], number[], string[]]
    expect([lefts, rights]).toEqual([[lowIntent], [highIntent]])
    expect(scores[0]).toBeGreaterThanOrEqual(40)
    expect(JSON.parse(evidence[0])).toMatchObject({ leftReceives: ['engineering'], rightReceives: ['design'] })
    expect(db.query.mock.calls[4][0]).toContain('DELETE FROM matches')
    expect(db.query.mock.calls[4][1]).toEqual([highIntent, [lowIntent], [highIntent]])
  })

  it('does nothing for an intent the actor does not own', async () => {
    const db = database([ok, { rows: [], rowCount: 0 }])
    expect(await new PostgresMatchingGateway(db.value).refresh(actorId, highIntent)).toBe(false)
    expect(db.query).toHaveBeenCalledTimes(2)
  })

  it('explains each match from the viewer side, hides identity, and marks it shown', async () => {
    const row = {
      id: lowIntent, left_intent_id: lowIntent, right_intent_id: highIntent, score: '77.00', score_cursor: '77.00', status: 'candidate',
      explanation: { leftReceives: ['design'], rightReceives: ['engineering'], sharedTopics: ['ai'], modeFit: true },
      viewer_intent_id: highIntent, intent_id: lowIntent, owner_id: '00000000-0000-4000-8000-000000000002', title: 'Design studio', outcome: 'Ship',
      offers: ['design'], needs: ['engineering'], topics: ['ai'], mode: 'online', horizon: 'month', display_name: null, verification_level: 1,
      intro_id: null, intro_status: null, intro_sender_id: null,
    }
    const db = database([ok, { rows: [{}], rowCount: 1 }, { rows: [row, { ...row, id: highIntent }], rowCount: 2 }, ok])
    const page = await new PostgresMatchingGateway(db.value).list({ actorId, intentId: highIntent, limit: 1 })
    expect(page?.items[0]).toMatchObject({ score: 77, status: 'shown', youReceive: ['engineering'], theyReceive: ['design'], counterpart: { displayName: null } })
    expect(decodeMatchCursor(page?.page.nextCursor ?? '')).toEqual({ score: '77.00', id: lowIntent })
    expect(db.query.mock.calls[3]).toEqual([expect.stringContaining("SET status = 'shown'"), [[lowIntent]]])
  })

  it('rejects cursors it did not issue', () => {
    expect(() => decodeMatchCursor(encodeMatchCursor('abc', lowIntent))).toThrow(InvalidCursorError)
  })
})
