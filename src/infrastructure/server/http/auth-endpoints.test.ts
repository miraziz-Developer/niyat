import { describe, expect, it, vi } from 'vitest'
import { ManageMagicLinks, type MagicLinkGateway } from '../../../application/auth/magic-link'
import type { CreatedSession } from '../ports'
import { clientIpHeader, createAuthHandler } from './auth-endpoints'
import { RateLimiter } from './rate-limiter'

const origin = 'https://niyat.test'
const token = 'T'.repeat(43)

function setup(consumed: { userId: string } | null = { userId: 'user' }, limit = 20) {
  const gateway: MagicLinkGateway = { issue: vi.fn().mockResolvedValue('issued'), consume: vi.fn().mockResolvedValue(consumed) }
  const mailer = { send: vi.fn().mockResolvedValue(undefined) }
  const sessions = { create: vi.fn().mockResolvedValue({ session: { userId: 'user', csrfToken: 'csrf', expiresAt: '2999-01-01T00:00:00Z' }, cookie: 'niyat_session=abc; HttpOnly; Secure' }) }
  const magicLinks = new ManageMagicLinks<CreatedSession>(gateway, mailer, sessions, { randomToken: () => token, hash: value => value }, { appOrigin: origin, ttlMinutes: 15, hourlyLimit: 5 })
  return { gateway, mailer, handler: createAuthHandler({ magicLinks, limiter: new RateLimiter(limit, 60_000), allowedOrigin: origin, requestId: () => 'request-id' }) }
}

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`https://api.niyat.test${path}`, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json', origin, [clientIpHeader]: '203.0.113.9', ...headers } })
}

describe('sign-in endpoints', () => {
  it('ignores unrelated paths so the authenticated router handles them', async () => {
    expect(await setup().handler(new Request('https://api.niyat.test/v1/intents'), '/v1/intents')).toBeNull()
  })

  it('answers 202 for a valid email and 400 for a malformed one', async () => {
    const { handler, mailer } = setup()
    const sent = await handler(post('/v1/auth/magic-link', { email: 'Aziza@Example.uz' }), '/v1/auth/magic-link')
    expect(sent?.status).toBe(202)
    expect(await sent?.json()).toEqual({ status: 'sent' })
    expect(mailer.send).toHaveBeenCalledOnce()
    expect((await handler(post('/v1/auth/magic-link', { email: 'nope' }), '/v1/auth/magic-link'))?.status).toBe(400)
    expect((await handler(post('/v1/auth/magic-link', { email: 'a@b.uz', extra: 1 }), '/v1/auth/magic-link'))?.status).toBe(400)
  })

  it('rejects cross-origin sign-in attempts before doing any work', async () => {
    const { handler, gateway } = setup()
    const response = await handler(post('/v1/auth/magic-link/verify', { token }, { origin: 'https://evil.test' }), '/v1/auth/magic-link/verify')
    expect(response?.status).toBe(403)
    expect(await response?.json()).toMatchObject({ code: 'invalid_origin' })
    expect(gateway.consume).not.toHaveBeenCalled()
  })

  it('opens a session cookie for a valid link and refuses a used one', async () => {
    const ok = await setup().handler(post('/v1/auth/magic-link/verify', { token }), '/v1/auth/magic-link/verify')
    expect(ok?.status).toBe(200)
    expect(ok?.headers.get('set-cookie')).toContain('Secure')
    expect(await ok?.json()).toMatchObject({ userId: 'user', csrfToken: 'csrf' })
    const used = await setup(null).handler(post('/v1/auth/magic-link/verify', { token }), '/v1/auth/magic-link/verify')
    expect(used?.status).toBe(403)
  })

  it('rate-limits per client address', async () => {
    const { handler } = setup(null, 2)
    const statuses = []
    for (let attempt = 0; attempt < 3; attempt += 1) statuses.push((await handler(post('/v1/auth/magic-link/verify', { token }), '/v1/auth/magic-link/verify'))?.status)
    expect(statuses).toEqual([403, 403, 429])
    expect((await handler(post('/v1/auth/magic-link/verify', { token }, { [clientIpHeader]: '198.51.100.1' }), '/v1/auth/magic-link/verify'))?.status).toBe(403)
  })
})

describe('RateLimiter', () => {
  it('resets after the window', () => {
    let now = 0
    const limiter = new RateLimiter(1, 1000, () => now)
    expect([limiter.allow('a'), limiter.allow('a')]).toEqual([true, false])
    now = 1000
    expect(limiter.allow('a')).toBe(true)
  })
})
