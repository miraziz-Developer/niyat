import type { IssueResult, MagicLinkGateway } from '../../../application/auth/magic-link'
import type { SqlDatabase } from '../ports'

type ConsumedRow = Record<string, unknown> & { email_normalized: string }
type UserRow = Record<string, unknown> & { user_id: string; status: string }

export class PostgresMagicLinkGateway implements MagicLinkGateway {
  constructor(private readonly database: SqlDatabase) {}

  issue(email: string, tokenHash: string, expiresAt: Date, hourlyLimit: number): Promise<IssueResult> {
    return this.database.transaction(async transaction => {
      // Serialises requests for one email so the hourly limit cannot be raced.
      await transaction.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 2))`, [`login:${email}`])
      const eligible = await transaction.query<{ eligible: boolean }>(`
        SELECT EXISTS (SELECT 1 FROM invitations WHERE email_normalized = $1 AND revoked_at IS NULL)
            OR EXISTS (
              SELECT 1 FROM auth_identities JOIN users ON users.id = auth_identities.user_id
              WHERE auth_identities.provider = 'email' AND auth_identities.provider_subject = $1 AND users.status = 'active'
            ) AS eligible`, [email])
      if (!eligible.rows[0]?.eligible) return 'not_eligible'
      const recent = await transaction.query<{ count: number }>(`
        SELECT count(*)::int AS count FROM login_tokens WHERE email_normalized = $1 AND created_at > now() - interval '1 hour'`, [email])
      if ((recent.rows[0]?.count ?? 0) >= hourlyLimit) return 'rate_limited'
      await transaction.query(`INSERT INTO login_tokens (email_normalized, token_hash, expires_at) VALUES ($1, $2, $3)`, [email, tokenHash, expiresAt])
      return 'issued'
    })
  }

  consume(tokenHash: string): Promise<{ userId: string } | null> {
    return this.database.transaction(async transaction => {
      // The conditional UPDATE is the single-use guarantee: two concurrent clicks cannot both win.
      const consumed = await transaction.query<ConsumedRow>(`
        UPDATE login_tokens SET consumed_at = now()
        WHERE token_hash = $1 AND consumed_at IS NULL AND expires_at > now()
        RETURNING email_normalized`, [tokenHash])
      const email = consumed.rows[0]?.email_normalized
      if (!email) return null
      // Signing in retires every other outstanding link for the same address.
      await transaction.query(`UPDATE login_tokens SET consumed_at = now() WHERE email_normalized = $1 AND consumed_at IS NULL`, [email])

      const existing = await transaction.query<UserRow>(`
        SELECT auth_identities.user_id, users.status FROM auth_identities JOIN users ON users.id = auth_identities.user_id
        WHERE auth_identities.provider = 'email' AND auth_identities.provider_subject = $1 FOR UPDATE OF auth_identities`, [email])
      if (existing.rows[0]) {
        if (existing.rows[0].status !== 'active') return null
        await transaction.query(`UPDATE auth_identities SET last_authenticated_at = now() WHERE provider = 'email' AND provider_subject = $1`, [email])
        return { userId: existing.rows[0].user_id }
      }

      const invitation = await transaction.query(`SELECT 1 FROM invitations WHERE email_normalized = $1 AND revoked_at IS NULL FOR UPDATE`, [email])
      if (!invitation.rows[0]) return null
      const user = await transaction.query<{ id: string }>(`INSERT INTO users (status) VALUES ('active') RETURNING id`)
      const userId = user.rows[0]!.id
      await transaction.query(`
        INSERT INTO auth_identities (user_id, provider, provider_subject, email_normalized, last_authenticated_at)
        VALUES ($1, 'email', $2, $2, now())`, [userId, email])
      await transaction.query(`UPDATE invitations SET accepted_user_id = $1, accepted_at = now() WHERE email_normalized = $2`, [userId, email])
      await transaction.query(`
        INSERT INTO audit_events (actor_id, action, resource_type, resource_id) VALUES ($1, 'account.created', 'user', $1)`, [userId])
      return { userId }
    })
  }
}
