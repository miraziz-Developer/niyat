import { afterEach, describe, expect, it, vi } from 'vitest'
import { OutcomeVerificationApi } from './outcome-verification-api'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

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

  it('bootstraps a configured private-alpha session when no session exists', async () => {
    vi.stubEnv('VITE_DEV_USER_ID', '00000000-0000-4000-8000-000000000001')
    const fetch = vi.fn()
      .mockResolvedValueOnce(Response.json({ message: 'Authentication required' }, { status: 401 }))
      .mockResolvedValueOnce(Response.json({ userId: 'alpha-user', csrfToken: 'csrf', expiresAt: '2999-01-01T00:00:00Z' }, { status: 201 }))
      .mockResolvedValueOnce(Response.json({ items: [] }))
      .mockResolvedValueOnce(Response.json({ items: [] }))
      .mockResolvedValueOnce(Response.json({ items: [] }))
    vi.stubGlobal('fetch', fetch)

    await expect(new OutcomeVerificationApi().load()).resolves.toMatchObject({ userId: 'alpha-user' })
    expect(fetch.mock.calls[1][0]).toBe('/v1/dev/session')
    expect(new Headers((fetch.mock.calls[1][1] as RequestInit).headers).get('X-Dev-User-Id')).toBe('00000000-0000-4000-8000-000000000001')
  })
})