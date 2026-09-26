import { ApplicationError } from '../../../application/intros/intro-request'
import { InvalidCursorError, type CreateIntentCommand, type IntentCommand, type IntentGateway, type IntentPage, type ListIntentsQuery, type ServerIntent, type UpdateIntentCommand } from '../../../application/intents/intent'
import type { SqlDatabase } from '../ports'
import { withActor, toIso } from './actor-transaction'

type IntentRow = Record<string, unknown> & {
  id: string
  owner_id: string
  title: string
  outcome: string
  offers: string[]
  needs: string[]
  topics: string[]
  mode: ServerIntent['mode']
  horizon: ServerIntent['horizon']
  visibility: ServerIntent['visibility']
  status: ServerIntent['status']
  created_at: Date | string
  updated_at: Date | string
  cursor_at: string
}

// cursor_at keeps microsecond precision; a JS Date would truncate it and skip rows between pages.
const columns = `id, owner_id, title, outcome, offers, needs, topics, mode, horizon, visibility, status, created_at, updated_at,
  to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_at`

export class PostgresIntentGateway implements IntentGateway {
  constructor(private readonly database: SqlDatabase) {}

  create({ actorId, input }: CreateIntentCommand): Promise<ServerIntent> {
    return withActor(this.database, actorId, async transaction => {
      const result = await transaction.query<IntentRow>(`
        INSERT INTO intents (owner_id, title, outcome, offers, needs, topics, mode, horizon, visibility, status, published_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CASE WHEN $10::intent_status = 'draft' THEN NULL ELSE now() END)
        RETURNING ${columns}`,
      [actorId, input.title, input.outcome, input.offers, input.needs, input.topics, input.mode, input.horizon, input.visibility, input.status])
      return mapIntent(result.rows[0])
    })
  }

  find({ actorId, intentId }: IntentCommand): Promise<ServerIntent | null> {
    return withActor(this.database, actorId, async transaction => {
      const result = await transaction.query<IntentRow>(`SELECT ${columns} FROM intents WHERE id = $1 AND owner_id = $2`, [intentId, actorId])
      return result.rows[0] ? mapIntent(result.rows[0]) : null
    })
  }

  update({ actorId, intentId, input }: UpdateIntentCommand, assertTransition: (current: ServerIntent) => void): Promise<ServerIntent | null> {
    return withActor(this.database, actorId, async transaction => {
      const current = await transaction.query<IntentRow>(`SELECT ${columns} FROM intents WHERE id = $1 AND owner_id = $2 FOR UPDATE`, [intentId, actorId])
      if (!current.rows[0]) return null
      assertTransition(mapIntent(current.rows[0]))
      const result = await transaction.query<IntentRow>(`
        UPDATE intents
        SET title = $3, outcome = $4, offers = $5, needs = $6, topics = $7, mode = $8, horizon = $9, visibility = $10, status = $11,
            published_at = CASE WHEN $11::intent_status = 'draft' THEN NULL ELSE coalesce(published_at, now()) END,
            updated_at = now()
        WHERE id = $1 AND owner_id = $2
        RETURNING ${columns}`,
      [intentId, actorId, input.title, input.outcome, input.offers, input.needs, input.topics, input.mode, input.horizon, input.visibility, input.status])
      return mapIntent(result.rows[0])
    })
  }

  remove({ actorId, intentId }: IntentCommand): Promise<boolean> {
    return withActor(this.database, actorId, async transaction => {
      const owned = await transaction.query(`SELECT id FROM intents WHERE id = $1 AND owner_id = $2 FOR UPDATE`, [intentId, actorId])
      if (!owned.rows[0]) return false
      // Locking the matches blocks a concurrent intro insert (its FK takes KEY SHARE) until this delete settles.
      await transaction.query(`SELECT id FROM matches WHERE left_intent_id = $1 OR right_intent_id = $1 FOR UPDATE`, [intentId])
      const linked = await transaction.query<{ linked: boolean }>(`
        SELECT EXISTS (
          SELECT 1 FROM intro_requests
          JOIN matches ON matches.id = intro_requests.match_id
          WHERE matches.left_intent_id = $1 OR matches.right_intent_id = $1
        ) AS linked`, [intentId])
      // Deleting would cascade into the counterparty's intro and collaboration history.
      if (linked.rows[0]?.linked) throw new ApplicationError('conflict', 'An intent with intro history cannot be deleted; complete or pause it instead')
      await transaction.query(`DELETE FROM intents WHERE id = $1 AND owner_id = $2`, [intentId, actorId])
      return true
    })
  }

  async list({ actorId, cursor, limit }: ListIntentsQuery): Promise<IntentPage> {
    const after = cursor === undefined ? null : decodeCursor(cursor)
    return withActor(this.database, actorId, async transaction => {
      const result = await transaction.query<IntentRow>(`
        SELECT ${columns} FROM intents
        WHERE owner_id = $1 AND ($2::timestamptz IS NULL OR (updated_at, id) < ($2::timestamptz, $3::uuid))
        ORDER BY updated_at DESC, id DESC
        LIMIT $4`,
      [actorId, after?.updatedAt ?? null, after?.id ?? null, limit + 1])
      const rows = result.rows.slice(0, limit)
      const last = rows.at(-1)
      return {
        items: rows.map(row => mapIntent(row)),
        page: { nextCursor: result.rows.length > limit && last ? encodeCursor(last.cursor_at, last.id) : null },
      }
    })
  }
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const timestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/

export function encodeCursor(updatedAt: string, id: string): string {
  return Buffer.from(`${updatedAt}|${id}`, 'utf8').toString('base64url')
}

export function decodeCursor(cursor: string): { updatedAt: string; id: string } {
  const [updatedAt, id, ...rest] = Buffer.from(cursor, 'base64url').toString('utf8').split('|')
  if (rest.length || !timestamp.test(updatedAt ?? '') || !uuid.test(id ?? '')) throw new InvalidCursorError()
  return { updatedAt, id }
}

function mapIntent(row: IntentRow | undefined): ServerIntent {
  if (!row) throw new Error('Database did not return an intent')
  return {
    id: row.id,
    ownerId: row.owner_id,
    title: row.title,
    outcome: row.outcome,
    offers: row.offers,
    needs: row.needs,
    topics: row.topics,
    mode: row.mode,
    horizon: row.horizon,
    visibility: row.visibility,
    status: row.status,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  }
}
