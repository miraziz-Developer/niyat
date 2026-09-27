import { describe, expect, it, vi } from 'vitest'
import { ManageMagicLinks, normalizeEmail, type MagicLinkGateway, type Mailer } from './magic-link'

const crypto = { randomToken: () => 'T'.repeat(43), hash: (value: string) => `hash:${value}` }
const options = { appOrigin: 'https://niyat.test', ttlMinutes: 15, hourlyLimit: 5, now: () => Date.UTC(2030, 0, 1) }

function setup(issue: Awaited<ReturnType<MagicLinkGateway['issue']>> = 'issued', consumed: { userId: string } | null = { userId: 'user' }) {
  const gateway: MagicLinkGateway = { issue: vi.fn().mockResolvedValue(issue), consume: vi.fn().mockResolvedValue(consumed) }
  const mailer: Mailer = { send: vi.fn().mockResolvedValue(undefined) }
  const sessions = { create: vi.fn().mockResolvedValue({ cookie: 'c' }) }
  return { gateway, mailer, sessions, links: new ManageMagicLinks(gateway, mailer, sessions, crypto, options) }
}

describe('magic link sign-in', () => {
  it('normalizes emails and rejects malformed ones', () => {
    expect(normalizeEmail('  Aziza@Example.UZ ')).toBe('aziza@example.uz')
    expect(normalizeEmail('not-an-email')).toBeNull()
    expect(normalizeEmail(`${'a'.repeat(250)}@x.uz`)).toBeNull()
  })

  it('stores only the token hash and mails a one-time link', async () => {
    const { gateway, mailer, links } = setup()
    await links.request('Aziza@Example.uz')
    expect(gateway.issue).toHaveBeenCalledWith('aziza@example.uz', `hash:${'T'.repeat(43)}`, new Date(Date.UTC(2030, 0, 1, 0, 15)), 5)
    expect(mailer.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'aziza@example.uz', text: expect.stringContaining(`https://niyat.test/?login_token=${'T'.repeat(43)}`) }))
  })

  it('answers identically for uninvited or rate-limited emails without sending mail', async () => {
    for (const result of ['not_eligible', 'rate_limited'] as const) {
      const { mailer, links } = setup(result)
      await expect(links.request('stranger@example.uz')).resolves.toBeUndefined()
      expect(mailer.send).not.toHaveBeenCalled()
    }
  })

  it('answers without waiting on mail delivery and reports delivery failures', async () => {
    const reportError = vi.fn()
    const failing = new ManageMagicLinks({ issue: vi.fn().mockResolvedValue('issued'), consume: vi.fn() }, { send: vi.fn().mockRejectedValue(new Error('provider down')) }, { create: vi.fn() }, crypto, { ...options, reportError })
    await expect(failing.request('aziza@example.uz')).resolves.toBeUndefined()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(reportError).toHaveBeenCalledWith(new Error('provider down'))
  })

  it('opens a session only for a consumable token', async () => {
    const ok = setup()
    await expect(ok.links.verify('T'.repeat(43))).resolves.toEqual({ cookie: 'c' })
    expect(ok.sessions.create).toHaveBeenCalledWith('user')

    const used = setup('issued', null)
    await expect(used.links.verify('T'.repeat(43))).rejects.toMatchObject({ code: 'forbidden' })
    await expect(used.links.verify('short')).rejects.toMatchObject({ code: 'forbidden' })
    expect(used.gateway.consume).toHaveBeenCalledOnce()
  })
})
