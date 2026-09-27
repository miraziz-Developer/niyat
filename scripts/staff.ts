import pg from 'pg'
import { normalizeEmail } from '../src/application/auth/magic-link'

/*
 * Staff roles. Run with the owner DATABASE_URL:
 *   npm run staff -- --grant moderator aziza@example.uz
 *   npm run staff -- --revoke aziza@example.uz
 *   npm run staff -- --list
 * The member must have signed in once (the account is created on first sign-in).
 */
const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL is required')
const [command, ...rest] = process.argv.slice(2)
const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 })
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

async function resolveUser(value: string): Promise<string> {
  if (uuid.test(value)) return value.toLowerCase()
  const email = normalizeEmail(value)
  if (!email) throw new Error(`Not an email or user id: ${value}`)
  const result = await pool.query<{ user_id: string }>(`SELECT user_id FROM auth_identities WHERE provider = 'email' AND provider_subject = $1`, [email])
  if (!result.rows[0]) throw new Error(`${email} has not signed in yet`)
  return result.rows[0].user_id
}

try {
  if (command === '--list') {
    const result = await pool.query<{ user_id: string; role: string; email: string | null }>(`
      SELECT staff_roles.user_id, staff_roles.role, auth_identities.provider_subject AS email FROM staff_roles
      LEFT JOIN auth_identities ON auth_identities.user_id = staff_roles.user_id AND auth_identities.provider = 'email' ORDER BY granted_at`)
    for (const row of result.rows) console.log(`${row.role}\t${row.email ?? row.user_id}`)
  } else if (command === '--grant' && (rest[0] === 'moderator' || rest[0] === 'admin') && rest[1]) {
    const userId = await resolveUser(rest[1])
    await pool.query(`INSERT INTO staff_roles (user_id, role) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role`, [userId, rest[0]])
    console.log(`Granted ${rest[0]} to ${rest[1]}`)
  } else if (command === '--revoke' && rest[0]) {
    await pool.query(`DELETE FROM staff_roles WHERE user_id = $1`, [await resolveUser(rest[0])])
    console.log(`Revoked staff role from ${rest[0]}`)
  } else {
    throw new Error('Usage: npm run staff -- --grant moderator|admin <email|user-id> | --revoke <email|user-id> | --list')
  }
} finally {
  await pool.end()
}
