import type { Pool, PoolClient, QueryResultRow } from 'pg'
import type { SqlDatabase, SqlExecutor, SqlResult } from '../ports'

class PgExecutor implements SqlExecutor {
  constructor(private readonly client: PoolClient) {}

  async query<Row extends Record<string, unknown>>(text: string, values: readonly unknown[] = []): Promise<SqlResult<Row>> {
    const result = await this.client.query<QueryResultRow>(text, [...values])
    return { rows: result.rows as Row[], rowCount: result.rowCount ?? 0 }
  }
}

export class PgDatabase implements SqlDatabase {
  constructor(private readonly pool: Pool) {}

  async transaction<T>(work: (transaction: SqlExecutor) => Promise<T>): Promise<T> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const result = await work(new PgExecutor(client))
      await client.query('COMMIT')
      return result
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }
}