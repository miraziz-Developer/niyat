import type { Pool } from 'pg'
import { IdempotencyConflictError, type IdempotencyStore } from '../ports'

type RecordRow = { fingerprint: string; response: unknown }

export class PostgresIdempotencyStore implements IdempotencyStore {
  constructor(private readonly pool: Pool) {}

  async run<T>(actorId: string, operation: string, key: string, fingerprint: string, action: () => Promise<T>): Promise<T> {
    const client = await this.pool.connect()
    const lock = `${actorId}:${operation}:${key}`
    try {
      await client.query('SELECT pg_advisory_lock(hashtextextended($1, 0))', [lock])
      const existing = await client.query<RecordRow>(`
        SELECT fingerprint, response FROM idempotency_records
        WHERE actor_id = $1 AND operation = $2 AND idempotency_key = $3 AND expires_at > now()`, [actorId, operation, key])
      if (existing.rows[0]) {
        if (existing.rows[0].fingerprint !== fingerprint) throw new IdempotencyConflictError()
        return existing.rows[0].response as T
      }
      const result = await action()
      await client.query(`
        INSERT INTO idempotency_records (actor_id, operation, idempotency_key, fingerprint, response)
        VALUES ($1, $2, $3, $4, $5::jsonb)
        ON CONFLICT (actor_id, operation, idempotency_key) DO UPDATE
        SET fingerprint = EXCLUDED.fingerprint, response = EXCLUDED.response,
            created_at = now(), expires_at = now() + interval '24 hours'
        WHERE idempotency_records.expires_at <= now()`, [actorId, operation, key, fingerprint, JSON.stringify(result)])
      return result
    } finally {
      await client.query('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [lock]).catch(() => undefined)
      client.release()
    }
  }
}