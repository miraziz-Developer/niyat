import { createHash, randomBytes } from 'node:crypto'
import type { Pool } from 'pg'
import type { CreatedSession, Session, SessionResolver } from '../ports'

const cookieName = 'niyat_session'
type SessionRow = { user_id: string; csrf_token: string; expires_at: Date | string }

export class PostgresSessionResolver implements SessionResolver {
  /** `secure` adds the Secure cookie attribute; it must be on whenever the app is served over HTTPS. */
  constructor(private readonly pool: Pool, private readonly options: { secure: boolean } = { secure: false }) {}

  async resolve(request: Request): Promise<Session | null> {
    const token = readCookie(request.headers.get('cookie') ?? '', cookieName)
    if (!token) return null
    const result = await this.pool.query<SessionRow>(`
      UPDATE sessions SET last_seen_at = now()
      WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()
      RETURNING user_id, csrf_token, expires_at`, [hash(token)])
    const row = result.rows[0]
    return row ? { userId: row.user_id, csrfToken: row.csrf_token, expiresAt: new Date(row.expires_at).toISOString() } : null
  }

  async create(userId: string): Promise<CreatedSession> {
    const token = randomBytes(32).toString('base64url')
    const csrfToken = randomBytes(32).toString('base64url')
    const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000)
    await this.pool.query('INSERT INTO sessions (user_id, token_hash, csrf_token, expires_at) VALUES ($1, $2, $3, $4)', [userId, hash(token), csrfToken, expiresAt])
    return {
      session: { userId, csrfToken, expiresAt: expiresAt.toISOString() },
      cookie: `${cookieName}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=43200${this.options.secure ? '; Secure' : ''}`,
    }
  }

  clearCookie(): string {
    return `${cookieName}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${this.options.secure ? '; Secure' : ''}`
  }

  async revoke(request: Request): Promise<void> {
    const token = readCookie(request.headers.get('cookie') ?? '', cookieName)
    if (token) await this.pool.query('UPDATE sessions SET revoked_at = now() WHERE token_hash = $1', [hash(token)])
  }
}

function hash(value: string): string { return createHash('sha256').update(value).digest('hex') }
function readCookie(header: string, name: string): string | null {
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) return decodeURIComponent(rest.join('='))
  }
  return null
}