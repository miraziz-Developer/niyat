import type { SqlDatabase, SqlExecutor } from '../ports'

/** Opens (or joins) a transaction with the RLS actor set for its duration only. */
export function withActor<T>(database: SqlDatabase, actorId: string, work: (transaction: SqlExecutor) => Promise<T>): Promise<T> {
  return database.transaction(async transaction => {
    await transaction.query(`SELECT set_config('app.user_id', $1, true)`, [actorId])
    return work(transaction)
  })
}

export function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

export function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === '23505')
}

export function required<T>(value: T | undefined, resource: string): T {
  if (!value) throw new Error(`Database did not return ${resource}`)
  return value
}
