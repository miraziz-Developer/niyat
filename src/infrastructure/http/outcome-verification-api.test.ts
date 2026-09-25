import { afterEach, describe, expect, it, vi } from 'vitest'
import { OutcomeVerificationApi } from './outcome-verification-api'

afterEach(() => vi.unstubAllGlobals())

describe('OutcomeVerificationApi', () => {
  it('hydrates session before parallel workspace reads', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(Response.json({ userId: 'user', csrfToken: 'csrf', expiresAt: '2999-01-01T00:00:00Z' }))
      .mockResolvedValueOnce(Response.json({ items: [] }))
      .mockResolvedValueOnce(Response.json({ items: [] }))
      .mockResolvedValueOnce(Response.json({ items: [] }))
    vi.stubGlobal('fetch', fetch)
    await expect(new OutcomeVerificationApi().load()).resolves.toEqual({ userId: 'user', introRequests: [], collaborations: [], trustSignals: [] })
    expect(fetch.mock.calls.map(call => call[0])).toEqual(['/v1/session', '/v1/intro-requests', '/v1/me/collaborations', '/v1/me/trust-signals'])
  })

  it('sends CSRF and idempotency headers on mutations', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(Response.json({ userId: 'user', csrfToken: 'csrf', expiresAt: '2999-01-01T00:00:00Z' }))
      .mockResolvedValueOnce(Response.json({ items: [] }))
      .mockResolvedValueOnce(Response.json({ items: [] }))
      .mockResolvedValueOnce(Response.json({ items: [] }))
      .mockResolvedValueOnce(Response.json({ id: 'collaboration' }))
    vi.stubGlobal('fetch', fetch)
    const api = new OutcomeVerificationApi()
    await api.load()
    await api.createCollaboration('intro', 'Title', ['Milestone'])
    const init = fetch.mock.calls[4][1] as RequestInit
    expect(new Headers(init.headers).get('X-CSRF-Token')).toBe('csrf')
    expect(new Headers(init.headers).get('Idempotency-Key')).toHaveLength(36)
  })
})