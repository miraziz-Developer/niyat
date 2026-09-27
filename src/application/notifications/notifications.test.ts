import { describe, expect, it, vi } from 'vitest'
import { defaultPreferences, maxAttempts, NotificationDispatcher, renderNotification, type NotificationJob, type NotificationQueue } from './notifications'

function queue(jobs: NotificationJob[]) {
  const value = { claim: vi.fn().mockResolvedValue(jobs), finish: vi.fn().mockResolvedValue(undefined), retry: vi.fn().mockResolvedValue(undefined) }
  return value satisfies NotificationQueue
}
const job = (overrides: Partial<NotificationJob> = {}): NotificationJob => ({ id: 'n1', kind: 'intro_requested', email: 'a@b.uz', preferences: defaultPreferences, attempts: 1, ...overrides })

describe('notification dispatch', () => {
  it('sends, and skips members without an email or who opted out', async () => {
    const q = queue([job(), job({ id: 'n2', email: null }), job({ id: 'n3', kind: 'verification_requested', preferences: { ...defaultPreferences, outcomes: false } })])
    const mailer = { send: vi.fn().mockResolvedValue(undefined) }
    expect(await new NotificationDispatcher(q, mailer, 'https://niyat.test').runOnce()).toBe(3)
    expect(mailer.send).toHaveBeenCalledOnce()
    expect(q.finish.mock.calls).toEqual([['n1', 'sent'], ['n2', 'skipped', 'no email identity'], ['n3', 'skipped', 'disabled by recipient']])
  })

  it('retries with exponential backoff and gives up after the last attempt', async () => {
    const mailer = { send: vi.fn().mockRejectedValue(new Error('provider down')) }
    const first = queue([job({ attempts: 2 })])
    await new NotificationDispatcher(first, mailer, 'https://niyat.test').runOnce()
    expect(first.retry).toHaveBeenCalledWith('n1', 'provider down', 240)
    const last = queue([job({ attempts: maxAttempts })])
    await new NotificationDispatcher(last, mailer, 'https://niyat.test').runOnce()
    expect(last.finish).toHaveBeenCalledWith('n1', 'failed', 'provider down')
  })

  it('never includes names in the message', () => {
    const message = renderNotification('intro_accepted', 'a@b.uz', 'https://niyat.test')
    expect(message.subject).toBe('Intro so‘rovingiz qabul qilindi')
    expect(message.text).toContain('https://niyat.test')
  })
})
