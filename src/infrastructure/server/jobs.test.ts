import { describe, expect, it, vi } from 'vitest'
import { schedule } from './jobs'

describe('schedule', () => {
  it('never overlaps runs and keeps going after a failure', async () => {
    let release: () => void = () => undefined
    const task = vi.fn(() => new Promise<void>(resolve => { release = resolve }))
    const job = schedule('test', 60_000, task, vi.fn())
    await job.tick()
    expect(task).toHaveBeenCalledTimes(1)
    release()
    await new Promise(resolve => setTimeout(resolve, 0))
    const report = vi.fn()
    const failing = schedule('failing', 60_000, () => Promise.reject(new Error('boom')), report)
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(report).toHaveBeenCalledWith('failing failed: boom')
    job.stop(); failing.stop()
  })
})
