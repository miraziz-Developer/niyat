import { afterEach, describe, expect, it, vi } from 'vitest'
import { NetworkError } from '../../application/ports/network-client'
import { NiyatApi } from './niyat-api'

afterEach(() => vi.unstubAllGlobals())

const session = { userId: 'user', csrfToken: 'csrf', expiresAt: '2999-01-01T00:00:00Z' }
const profile = { userId: 'user', displayName: 'Ali', bio: '', languages: [], verificationLevel: 0 }
const consent = { adultConfirmed: true, termsVersion: '2026-09-alpha', acceptedAt: '2030-01-01T00:00:00Z', current: true }

describe('NiyatApi', () => {
  it('connects with an existing session and treats a missing profile as null', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(Response.json(session))
      .mockResolvedValueOnce(Response.json({ code: 'not_found', message: 'Profile was not created yet' }, { status: 404 }))
      .mockResolvedValueOnce(Response.json(consent))
      .mockResolvedValueOnce(Response.json({ moderator: false }))
    vi.stubGlobal('fetch', fetch)
    await expect(new NiyatApi('/v1', undefined).connect()).resolves.toEqual({ userId: 'user', profile: null, consent, moderator: false })
    expect(fetch.mock.calls.map(call => call[0])).toEqual(['/v1/session', '/v1/me/profile', '/v1/me/consents', '/v1/me/roles'])
  })

  it('bootstraps a private-alpha session only after a 401', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(Response.json({ code: 'unauthorized' }, { status: 401 }))
      .mockResolvedValueOnce(Response.json(session, { status: 201 }))
      .mockResolvedValueOnce(Response.json(profile))
      .mockResolvedValueOnce(Response.json(consent))
      .mockResolvedValueOnce(Response.json({ moderator: false }))
    vi.stubGlobal('fetch', fetch)
    await expect(new NiyatApi('/v1', 'dev-user').connect()).resolves.toMatchObject({ profile: { displayName: 'Ali' } })
    expect(new Headers((fetch.mock.calls[1][1] as RequestInit).headers).get('X-Dev-User-Id')).toBe('dev-user')

    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json({ code: 'internal_error' }, { status: 500 })))
    await expect(new NiyatApi('/v1', 'dev-user').connect()).rejects.toMatchObject({ status: 500 })
  })

  it('sends CSRF and a fresh idempotency key on every mutation and handles 204', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(Response.json(session))
      .mockResolvedValueOnce(Response.json(profile))
      .mockResolvedValueOnce(Response.json(consent))
      .mockResolvedValueOnce(Response.json({ moderator: false }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetch)
    const api = new NiyatApi('/v1', undefined)
    await api.connect()
    await api.block('other', 'spam')
    await api.block('other')
    const [first, second] = [fetch.mock.calls[4][1], fetch.mock.calls[5][1]].map(init => new Headers((init as RequestInit).headers))
    expect(first.get('X-CSRF-Token')).toBe('csrf')
    expect(first.get('Idempotency-Key')).toHaveLength(36)
    expect(first.get('Idempotency-Key')).not.toBe(second.get('Idempotency-Key'))
  })

  it('refuses mutations before a session is loaded', async () => {
    await expect(new NiyatApi('/v1', undefined).block('other')).rejects.toMatchObject({ status: 401 })
  })

  it('follows list cursors and surfaces problem details as NetworkError', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(Response.json({ items: [{ id: 'a' }], page: { nextCursor: 'next' } }))
      .mockResolvedValueOnce(Response.json({ items: [{ id: 'b' }], page: { nextCursor: null } }))
      .mockResolvedValueOnce(Response.json({ code: 'conflict', message: 'Nope' }, { status: 409 }))
    vi.stubGlobal('fetch', fetch)
    const api = new NiyatApi('/v1', undefined)
    await expect(api.listIntents()).resolves.toEqual([{ id: 'a' }, { id: 'b' }])
    expect(fetch.mock.calls[1][0]).toBe('/v1/intents?limit=100&cursor=next')
    const error = await api.listIntroRequests().catch(caught => caught)
    expect(error).toBeInstanceOf(NetworkError)
    expect(error).toMatchObject({ status: 409, code: 'conflict', message: 'Nope' })
  })

  it('requests and verifies magic links without CSRF, then mutates with the new session', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(Response.json({ status: 'sent' }, { status: 202 }))
      .mockResolvedValueOnce(Response.json(session))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetch)
    const api = new NiyatApi('/v1', undefined)
    await api.requestMagicLink('aziza@example.uz')
    await api.verifyMagicLink('T'.repeat(43))
    await api.block('other')
    expect(fetch.mock.calls.map(call => call[0])).toEqual(['/v1/auth/magic-link', '/v1/auth/magic-link/verify', '/v1/blocks'])
    expect(new Headers((fetch.mock.calls[0][1] as RequestInit).headers).get('X-CSRF-Token')).toBeNull()
    expect(new Headers((fetch.mock.calls[2][1] as RequestInit).headers).get('X-CSRF-Token')).toBe('csrf')
  })
})
