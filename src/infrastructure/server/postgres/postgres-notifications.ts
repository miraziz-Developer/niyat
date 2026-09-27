import type { NotificationJob, NotificationKind, NotificationPreferences, NotificationQueue, PreferencesGateway } from '../../../application/notifications/notifications'
import type { SqlDatabase, SqlExecutor } from '../ports'
import { withActor } from './actor-transaction'

/** Writes an outbox row inside the caller's transaction, so the notification commits with the event. */
export async function enqueueNotification(transaction: SqlExecutor, recipientId: string, kind: NotificationKind, resourceId: string): Promise<void> {
  await transaction.query(`INSERT INTO notification_outbox (recipient_id, kind, resource_id) VALUES ($1, $2, $3)`, [recipientId, kind, resourceId])
}

type PreferenceRow = Record<string, unknown> & { intro_requests: boolean; intro_responses: boolean; outcomes: boolean }
type JobRow = Record<string, unknown> & PreferenceRow & { id: string; kind: NotificationKind; email: string | null; attempts: number }

const leaseSeconds = 300

export class PostgresNotificationQueue implements NotificationQueue {
  constructor(private readonly database: SqlDatabase) {}

  claim(limit: number): Promise<NotificationJob[]> {
    return this.database.transaction(async transaction => {
      const result = await transaction.query<JobRow>(`
        WITH due AS (
          SELECT id FROM notification_outbox
          WHERE status = 'pending' AND next_attempt_at <= now()
          ORDER BY next_attempt_at
          LIMIT $1
          FOR UPDATE SKIP LOCKED
        ), leased AS (
          UPDATE notification_outbox SET attempts = attempts + 1, next_attempt_at = now() + make_interval(secs => $2)
          FROM due WHERE notification_outbox.id = due.id
          RETURNING notification_outbox.id, notification_outbox.kind, notification_outbox.recipient_id, notification_outbox.attempts
        )
        SELECT leased.id, leased.kind, leased.attempts, identity.email_normalized AS email,
               coalesce(preferences.intro_requests, true) AS intro_requests,
               coalesce(preferences.intro_responses, true) AS intro_responses,
               coalesce(preferences.outcomes, true) AS outcomes
        FROM leased
        JOIN users ON users.id = leased.recipient_id
        LEFT JOIN auth_identities AS identity ON identity.user_id = leased.recipient_id AND identity.provider = 'email' AND users.status = 'active'
        LEFT JOIN notification_preferences AS preferences ON preferences.user_id = leased.recipient_id`, [limit, leaseSeconds])
      return result.rows.map(row => ({ id: row.id, kind: row.kind, email: row.email, attempts: Number(row.attempts), preferences: mapPreferences(row) }))
    })
  }

  async finish(id: string, status: 'sent' | 'skipped' | 'failed', note?: string): Promise<void> {
    await this.database.transaction(transaction => transaction.query(`
      UPDATE notification_outbox SET status = $2, last_error = $3, sent_at = CASE WHEN $2 = 'sent' THEN now() END WHERE id = $1`, [id, status, note ?? null]))
  }

  async retry(id: string, error: string, delaySeconds: number): Promise<void> {
    await this.database.transaction(transaction => transaction.query(`
      UPDATE notification_outbox SET last_error = $2, next_attempt_at = now() + make_interval(secs => $3) WHERE id = $1`, [id, error, delaySeconds]))
  }
}

export class PostgresPreferencesGateway implements PreferencesGateway {
  constructor(private readonly database: SqlDatabase) {}

  get(actorId: string): Promise<NotificationPreferences> {
    return withActor(this.database, actorId, async transaction => {
      const result = await transaction.query<PreferenceRow>(`SELECT intro_requests, intro_responses, outcomes FROM notification_preferences WHERE user_id = $1`, [actorId])
      return result.rows[0] ? mapPreferences(result.rows[0]) : { introRequests: true, introResponses: true, outcomes: true }
    })
  }

  save(actorId: string, preferences: NotificationPreferences): Promise<NotificationPreferences> {
    return withActor(this.database, actorId, async transaction => {
      const result = await transaction.query<PreferenceRow>(`
        INSERT INTO notification_preferences (user_id, intro_requests, intro_responses, outcomes) VALUES ($1, $2, $3, $4)
        ON CONFLICT (user_id) DO UPDATE SET intro_requests = EXCLUDED.intro_requests, intro_responses = EXCLUDED.intro_responses,
          outcomes = EXCLUDED.outcomes, updated_at = now()
        RETURNING intro_requests, intro_responses, outcomes`, [actorId, preferences.introRequests, preferences.introResponses, preferences.outcomes])
      return mapPreferences(result.rows[0]!)
    })
  }
}

function mapPreferences(row: PreferenceRow): NotificationPreferences {
  return { introRequests: row.intro_requests, introResponses: row.intro_responses, outcomes: row.outcomes }
}
