export type Session = {
  userId: string
  csrfToken: string
  expiresAt: string
}

export interface SessionResolver {
  resolve(request: Request): Promise<Session | null>
}

export interface IdempotencyStore {
  run<T>(actorId: string, operation: string, key: string, fingerprint: string, action: () => Promise<T>): Promise<T>
}

export class IdempotencyConflictError extends Error {
  constructor() {
    super('Idempotency-Key was already used with a different request')
    this.name = 'IdempotencyConflictError'
  }
}

export type SqlResult<Row> = { rows: Row[]; rowCount: number }

export interface SqlExecutor {
  query<Row extends Record<string, unknown>>(text: string, values?: readonly unknown[]): Promise<SqlResult<Row>>
}

export interface SqlDatabase {
  transaction<T>(work: (transaction: SqlExecutor) => Promise<T>): Promise<T>
}