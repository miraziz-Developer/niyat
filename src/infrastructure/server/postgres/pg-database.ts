import { AsyncLocalStorage } from 'node:async_hooks'
import type { Pool, PoolClient, QueryResultRow } from 'pg'
import type { SqlDatabase, SqlExecutor, SqlResult } from '../ports'

class PgExecutor implements SqlExecutor {
  constructor(private readonly client: PoolClient) {}

  async query<Row extends Record<string, unknown>>(text: string, values: readonly unknown[] = []): Promise<SqlResult<Row>> {
    const result = await this.client.query<QueryResultRow>(text, [...values])
    return { rows: result.rows as Row[], rowCount: result.rowCount ?? 0 }
  }
}

/**
 * Nested `transaction` calls join the ambient transaction instead of opening a new one.
 * This is the Unit of Work that lets the idempotency record commit atomically with the business change.
 */
export class PgDatabase implements SqlDatabase {
  private readonly ambient = new AsyncLocalStorage<SqlExecutor>()

  constructor(private readonly pool: Pool) {}

  async transaction<T>(work: (transaction: SqlExecutor) => Promise<T>): Promise<T> {
    const current = this.ambient.getStore()
    if (current) return work(current)

    const client = await this.pool.connect()
    // A connection dropped between two queries emits on the client; the next query rejects instead of crashing the process.
    const swallow = () => undefined
    client.on('error', swallow)
    try {
      await client.query('BEGIN')
      const executor = new PgExecutor(client)
      const result = await this.ambient.run(executor, () => work(executor))
      await client.query('COMMIT')
      return result
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw error
    } finally {
      client.off('error', swallow)
      client.release()
    }
  }
}
