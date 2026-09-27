import type { ConsentGateway } from '../../../application/consent/consent'
import type { SqlDatabase } from '../ports'
import { toIso, withActor } from './actor-transaction'

type ConsentRow = Record<string, unknown> & { is_adult_confirmed: boolean; terms_version: string | null; terms_accepted_at: Date | string | null }

export class PostgresConsentGateway implements ConsentGateway {
  constructor(private readonly database: SqlDatabase) {}

  get(actorId: string) {
    return withActor(this.database, actorId, async transaction => {
      const result = await transaction.query<ConsentRow>(`SELECT is_adult_confirmed, terms_version, terms_accepted_at FROM users WHERE id = $1`, [actorId])
      return result.rows[0] ? map(result.rows[0]) : null
    })
  }

  accept(actorId: string, termsVersion: string) {
    return withActor(this.database, actorId, async transaction => {
      const result = await transaction.query<ConsentRow>(`
        UPDATE users SET is_adult_confirmed = true, terms_version = $2, terms_accepted_at = now(), updated_at = now()
        WHERE id = $1
        RETURNING is_adult_confirmed, terms_version, terms_accepted_at`, [actorId, termsVersion])
      await transaction.query(`
        INSERT INTO audit_events (actor_id, action, resource_type, resource_id, metadata)
        VALUES ($1, 'consent.accepted', 'user', $1, jsonb_build_object('terms_version', $2::text))`, [actorId, termsVersion])
      return map(result.rows[0]!)
    })
  }
}

function map(row: ConsentRow) {
  return { adultConfirmed: row.is_adult_confirmed, termsVersion: row.terms_version, acceptedAt: row.terms_accepted_at ? toIso(row.terms_accepted_at) : null }
}
