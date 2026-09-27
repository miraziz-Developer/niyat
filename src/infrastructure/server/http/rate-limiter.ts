/** Fixed-window counter per key. Single-process only, which matches the single-host private-alpha deployment. */
export class RateLimiter {
  private readonly windows = new Map<string, { count: number; resetAt: number }>()

  constructor(private readonly limit: number, private readonly windowMs: number, private readonly now: () => number = Date.now) {}

  allow(key: string): boolean {
    const now = this.now()
    if (this.windows.size > 10_000) for (const [entry, value] of this.windows) if (value.resetAt <= now) this.windows.delete(entry)
    const current = this.windows.get(key)
    if (!current || current.resetAt <= now) {
      this.windows.set(key, { count: 1, resetAt: now + this.windowMs })
      return true
    }
    current.count += 1
    return current.count <= this.limit
  }
}
