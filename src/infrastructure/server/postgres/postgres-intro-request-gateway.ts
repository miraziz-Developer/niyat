import { ApplicationError, assertIntroTransitionActor, type CreateIntroRequestCommand, type IntroRequestGateway, type ServerIntroRequest, type TransitionIntroRequestCommand } from '../../../application/intros/intro-request'
import type { SqlDatabase, SqlExecutor } from '../ports'

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
}

type MatchRow = Record<string, unknown> & { receiver_id: string }

export class PostgresIntroRequestGateway implements IntroRequestGateway {
  constructor(private readonly database: SqlDatabase) {}

  create(command: CreateIntroRequestCommand): Promise<ServerIntroRequest> {
    return this.withActor(command.actorId, async transaction => {
      const eligible = await transaction.query<MatchRow>(
        `SELECT eligible_intro_receiver($1, $2) AS receiver_id`,
        [command.matchId, command.actorId],
      )
      const receiverId = eligible.rows[0]?.receiver_id
      if (!receiverId) throw new ApplicationError('forbidden', 'Match is not eligible for an intro request')

      try {
        const inserted = await transaction.query<IntroRow>(`
          INSERT INTO intro_requests (match_id, sender_id, receiver_id, scope, message, expires_at)
          VALUES ($1, $2, $3, $4, $5, now() + interval '7 days')
          RETURNING id, match_id, sender_id, receiver_id, scope, message, status, expires_at, created_at`,
        [command.matchId, command.actorId, receiverId, command.scope, command.message])
        return mapIntro(inserted.rows[0])
      } catch (error) {
        if (isUniqueViolation(error)) throw new ApplicationError('conflict', 'A pending request already exists for this match')
        throw error
      }
    })
  }

  transition(command: TransitionIntroRequestCommand): Promise<ServerIntroRequest> {
    return this.withActor(command.actorId, async transaction => {
      const found = await transaction.query<IntroRow>(`
        SELECT id, match_id, sender_id, receiver_id, scope, message, status, expires_at, created_at
        FROM intro_requests WHERE id = $1 FOR UPDATE`, [command.requestId])
      const request = found.rows[0]
      if (!request) throw new ApplicationError('not_found', 'Intro request was not found')
      if (request.status !== 'pending') throw new ApplicationError('conflict', 'Only pending requests can change status')
      assertIntroTransitionActor(
        { senderId: request.sender_id, receiverId: request.receiver_id },
        command,
      )
      const updated = await transaction.query<IntroRow>(`
        UPDATE intro_requests SET status = $2
        WHERE id = $1
        RETURNING id, match_id, sender_id, receiver_id, scope, message, status, expires_at, created_at`,
      [command.requestId, command.status])
      return mapIntro(updated.rows[0])
    })
  }

  private withActor<T>(actorId: string, work: (transaction: SqlExecutor) => Promise<T>): Promise<T> {
    return this.database.transaction(async transaction => {
      await transaction.query(`SELECT set_config('app.user_id', $1, true)`, [actorId])
      return work(transaction)
    })
  }
}

function mapIntro(row: IntroRow | undefined): ServerIntroRequest {
  if (!row) throw new Error('Database did not return an intro request')
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
  }
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === '23505')
}