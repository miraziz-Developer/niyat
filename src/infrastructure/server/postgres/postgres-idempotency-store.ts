import { IdempotencyConflictError, type IdempotencyStore, type SqlDatabase } from '../ports'

type RecordRow = Record<string, unknown> & { fingerprint: string; response: unknown }

/**
 * Runs the action inside the same database transaction that stores its response.
 * Either both the business change and the replay record commit, or neither does.
 */
export class PostgresIdempotencyStore implements IdempotencyStore {
  constructor(private readonly database: SqlDatabase) {}

  run<T>(actorId: string, operation: string, key: string, fingerprint: string, action: () => Promise<T>): Promise<T> {
    return this.database.transaction(async transaction => {
      await transaction.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`${actorId}:${operation}:${key}`])
      const existing = await transaction.query<RecordRow>(`
        SELECT fingerprint, response FROM idempotency_records
        WHERE actor_id = $1 AND operation = $2 AND idempotency_key = $3 AND expires_at > now()`, [actorId, operation, key])
      if (existing.rows[0]) {
        if (existing.rows[0].fingerprint !== fingerprint) throw new IdempotencyConflictError()
        return existing.rows[0].response as T
      }
      const result = await action()
      await transaction.query(`
        INSERT INTO idempotency_records (actor_id, operation, idempotency_key, fingerprint, response)
        VALUES ($1, $2, $3, $4, $5::jsonb)
        ON CONFLICT (actor_id, operation, idempotency_key) DO UPDATE
        SET fingerprint = EXCLUDED.fingerprint, response = EXCLUDED.response,
            created_at = now(), expires_at = now() + interval '24 hours'
        WHERE idempotency_records.expires_at <= now()`, [actorId, operation, key, fingerprint, JSON.stringify(result ?? null)])
      return result
    })
  }
}
