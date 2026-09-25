import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import pg from 'pg'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL is required')
const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 })
const directory = resolve(process.cwd(), 'db/migrations')

try {
  await pool.query(`SELECT pg_advisory_lock(hashtext('niyat_schema_migrations'))`)
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`)
  const files = (await readdir(directory)).filter(name => /^\d+_.+\.up\.sql$/.test(name)).sort()
  for (const name of files) {
    const applied = await pool.query('SELECT 1 FROM schema_migrations WHERE name = $1', [name])
    if (applied.rowCount) continue
    const client = await pool.connect()
    try {
      await client.query(await readFile(resolve(directory, name), 'utf8'))
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name])
      console.log(`Applied ${name}`)
    } finally { client.release() }
  }
} finally {
  await pool.query(`SELECT pg_advisory_unlock(hashtext('niyat_schema_migrations'))`).catch(() => undefined)
  await pool.end()
}