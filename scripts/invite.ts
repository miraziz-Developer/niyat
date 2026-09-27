import pg from 'pg'
import { normalizeEmail } from '../src/application/auth/magic-link'

/*
 * Private-alpha invitations. Run with the owner DATABASE_URL:
 *   npm run invite -- aziza@example.uz bobur@example.uz
 *   npm run invite -- --revoke aziza@example.uz
 *   npm run invite -- --list
 */
const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL is required')
const args = process.argv.slice(2)
const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 })

try {
  if (args[0] === '--list') {
    const result = await pool.query<{ email_normalized: string; accepted_at: Date | null; revoked_at: Date | null }>(
      'SELECT email_normalized, accepted_at, revoked_at FROM invitations ORDER BY created_at')
    for (const row of result.rows) console.log(`${row.email_normalized}\t${row.revoked_at ? 'revoked' : row.accepted_at ? 'accepted' : 'pending'}`)
    console.log(`${result.rowCount} invitation(s)`)
  } else {
    const revoke = args[0] === '--revoke'
    const emails = (revoke ? args.slice(1) : args).map(value => ({ value, email: normalizeEmail(value) }))
    const invalid = emails.filter(entry => !entry.email)
    if (!emails.length || invalid.length) throw new Error(invalid.length ? `Invalid email: ${invalid.map(entry => entry.value).join(', ')}` : 'Pass at least one email')
    for (const { email } of emails) {
      if (revoke) {
        await pool.query('UPDATE invitations SET revoked_at = now() WHERE email_normalized = $1', [email])
        // Revocation also ends any link already in the inbox.
        await pool.query('UPDATE login_tokens SET consumed_at = now() WHERE email_normalized = $1 AND consumed_at IS NULL', [email])
      } else {
        await pool.query(`INSERT INTO invitations (email_normalized) VALUES ($1)
          ON CONFLICT (email_normalized) DO UPDATE SET revoked_at = NULL`, [email])
      }
      console.log(`${revoke ? 'Revoked' : 'Invited'} ${email}`)
    }
  }
} finally {
  await pool.end()
}
