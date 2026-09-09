import { IdempotencyConflictError, type IdempotencyStore } from './ports'

type Entry = { fingerprint: string; result: Promise<unknown>; expiresAt: number }

export class MemoryIdempotencyStore implements IdempotencyStore {
  private readonly operations = new Map<string, Entry>()

  constructor(
    private readonly ttlMilliseconds = 24 * 60 * 60 * 1000,
    private readonly now: () => number = Date.now,
  ) {}

  run<T>(actorId: string, operation: string, key: string, fingerprint: string, action: () => Promise<T>): Promise<T> {
    const cacheKey = `${actorId}:${operation}:${key}`
    const existing = this.operations.get(cacheKey)
    if (existing && existing.expiresAt > this.now()) {
      if (existing.fingerprint !== fingerprint) return Promise.reject(new IdempotencyConflictError())
      return existing.result as Promise<T>
    }
    if (existing) this.operations.delete(cacheKey)

    const pending = action().catch(error => {
      this.operations.delete(cacheKey)
      throw error
    })
    this.operations.set(cacheKey, { fingerprint, result: pending, expiresAt: this.now() + this.ttlMilliseconds })
    return pending
  }
}