import { ApplicationError, assertIntroTransitionActor, type CreateIntroRequestCommand, type IntroRequestGateway, type ServerIntroRequest, type TransitionIntroRequestCommand } from '../../../application/intros/intro-request'
import type { SqlDatabase, SqlExecutor } from '../ports'
import { isUniqueViolation, toIso, withActor } from './actor-transaction'

type IntroRow = Record<string, unknown> & {
  id: string
  match_id: string
  sender_id: string
  receiver_id: string
  scope: string
  message: string
  status: ServerIntroRequest['status']
  expires_at: Date | string
  created_at: Date | string
  counterpart_user_id?: string | null
  counterpart_intent_id?: string | null
  counterpart_title?: string | null
  counterpart_offers?: string[] | null
  counterpart_needs?: string[] | null
  counterpart_display_name?: string | null
  counterpart_verification_level?: number | null
}

type MatchRow = Record<string, unknown> & { receiver_id: string | null }

// A pending request past its deadline reads as expired even before a sweeper persists it.
const effectiveStatus = `CASE WHEN intro_requests.status = 'pending' AND intro_requests.expires_at <= now() THEN 'expired'::intro_status ELSE intro_requests.status END`
const columns = `intro_requests.id, intro_requests.match_id, intro_requests.sender_id, intro_requests.receiver_id, intro_requests.scope,
  intro_requests.message, ${effectiveStatus} AS status, intro_requests.expires_at, intro_requests.created_at`

export class PostgresIntroRequestGateway implements IntroRequestGateway {
  constructor(private readonly database: SqlDatabase) {}

  create(command: CreateIntroRequestCommand): Promise<ServerIntroRequest> {
    return withActor(this.database, command.actorId, async transaction => {
      const eligible = await transaction.query<MatchRow>(`SELECT eligible_intro_receiver($1, $2) AS receiver_id`, [command.matchId, command.actorId])
      const receiverId = eligible.rows[0]?.receiver_id
      if (!receiverId) throw new ApplicationError('forbidden', 'Match is not eligible for an intro request')

      let id: string
      try {
        const inserted = await transaction.query<{ id: string }>(`
          INSERT INTO intro_requests (match_id, sender_id, receiver_id, scope, message, expires_at)
          VALUES ($1, $2, $3, $4, $5, now() + interval '7 days')
          RETURNING id`,
        [command.matchId, command.actorId, receiverId, command.scope, command.message])
        id = inserted.rows[0]!.id
      } catch (error) {
        if (isUniqueViolation(error)) throw new ApplicationError('conflict', 'A pending request already exists for this match')
        throw error
      }
      // One intro per match: the match leaves the eligible pool so a declined request cannot be re-sent.
      await transaction.query(`UPDATE matches SET status = 'intro_requested', updated_at = now() WHERE id = $1`, [command.matchId])
      return this.read(transaction, id)
    })
  }

  transition(command: TransitionIntroRequestCommand): Promise<ServerIntroRequest> {
    return withActor(this.database, command.actorId, async transaction => {
      const found = await transaction.query<IntroRow>(`SELECT ${columns} FROM intro_requests WHERE id = $1 FOR UPDATE`, [command.requestId])
      const request = found.rows[0]
      if (!request) throw new ApplicationError('not_found', 'Intro request was not found')
      if (request.status === 'expired') throw new ApplicationError('conflict', 'This intro request has expired')
      if (request.status !== 'pending') throw new ApplicationError('conflict', 'Only pending requests can change status')
      assertIntroTransitionActor({ senderId: request.sender_id, receiverId: request.receiver_id }, command)
      await transaction.query(`UPDATE intro_requests SET status = $2 WHERE id = $1`, [command.requestId, command.status])
      if (command.status === 'accepted') {
        await transaction.query(`UPDATE matches SET status = 'connected', updated_at = now() WHERE id = $1`, [request.match_id])
      }
      return this.read(transaction, command.requestId)
    })
  }

  list(actorId: string): Promise<ServerIntroRequest[]> {
    return withActor(this.database, actorId, async transaction => {
      const result = await transaction.query<IntroRow>(`${withCounterpart} WHERE intro_requests.sender_id = $1 OR intro_requests.receiver_id = $1 ORDER BY intro_requests.created_at DESC`, [actorId])
      return result.rows.map(mapIntro)
    })
  }

  private async read(transaction: SqlExecutor, id: string): Promise<ServerIntroRequest> {
    const result = await transaction.query<IntroRow>(`${withCounterpart} WHERE intro_requests.id = $1`, [id])
    if (!result.rows[0]) throw new Error('Database did not return an intro request')
    return mapIntro(result.rows[0])
  }
}

const withCounterpart = `
  SELECT ${columns},
         counterpart.owner_id AS counterpart_user_id, counterpart.intent_id AS counterpart_intent_id, counterpart.title AS counterpart_title,
         counterpart.offers AS counterpart_offers, counterpart.needs AS counterpart_needs,
         counterpart.display_name AS counterpart_display_name, counterpart.verification_level AS counterpart_verification_level
  FROM intro_requests
  LEFT JOIN LATERAL match_counterpart(intro_requests.match_id) AS counterpart ON true`

function mapIntro(row: IntroRow): ServerIntroRequest {
  return {
    id: row.id,
    matchId: row.match_id,
    senderId: row.sender_id,
    receiverId: row.receiver_id,
    scope: row.scope,
    message: row.message,
    status: row.status,
    expiresAt: toIso(row.expires_at),
    createdAt: toIso(row.created_at),
    counterpart: row.counterpart_user_id && row.counterpart_intent_id
      ? {
          userId: row.counterpart_user_id,
          displayName: row.counterpart_display_name ?? null,
          verificationLevel: Number(row.counterpart_verification_level ?? 0),
          intent: { id: row.counterpart_intent_id, title: row.counterpart_title ?? '', offers: row.counterpart_offers ?? [], needs: row.counterpart_needs ?? [] },
        }
      : null,
  }
}
