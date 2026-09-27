/** Runs a task on an interval without overlapping runs; errors are reported and the schedule continues. */
export function schedule(name: string, intervalMs: number, task: () => Promise<unknown>, report: (message: string) => void = console.error) {
  let running = false
  let stopped = false
  const tick = async () => {
    if (running || stopped) return
    running = true
    try { await task() } catch (error) { report(`${name} failed: ${error instanceof Error ? error.message : String(error)}`) } finally { running = false }
  }
  const timer = setInterval(() => void tick(), intervalMs)
  timer.unref?.()
  void tick()
  return { stop() { stopped = true; clearInterval(timer) }, tick }
}
