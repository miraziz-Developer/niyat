import { describe, expect, it, vi } from 'vitest'
import { currentTermsVersion, ManageConsents, type ConsentGateway } from './consent'

const accepted = { adultConfirmed: true, termsVersion: currentTermsVersion, acceptedAt: '2030-01-01T00:00:00.000Z' }

describe('consent', () => {
  it('is current only with 18+ confirmation and the latest terms version', async () => {
    const gateway: ConsentGateway = { get: vi.fn().mockResolvedValueOnce(accepted).mockResolvedValueOnce({ ...accepted, termsVersion: 'old' }).mockResolvedValueOnce(null), accept: vi.fn() }
    const consents = new ManageConsents(gateway)
    expect(await consents.hasAcceptedCurrent('u')).toBe(true)
    expect(await consents.hasAcceptedCurrent('u')).toBe(false)
    expect(await consents.hasAcceptedCurrent('u')).toBe(false)
  })

  it('refuses minors and stale terms before writing', async () => {
    const accept = vi.fn().mockResolvedValue(accepted)
    const consents = new ManageConsents({ get: vi.fn(), accept })
    await expect(consents.accept('u', { adultConfirmed: false, termsVersion: currentTermsVersion })).rejects.toMatchObject({ code: 'conflict' })
    await expect(consents.accept('u', { adultConfirmed: true, termsVersion: 'old' })).rejects.toMatchObject({ code: 'conflict' })
    expect(accept).not.toHaveBeenCalled()
    await expect(consents.accept('u', { adultConfirmed: true, termsVersion: currentTermsVersion })).resolves.toMatchObject({ current: true })
  })
})
