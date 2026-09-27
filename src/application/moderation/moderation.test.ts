import { describe, expect, it, vi } from 'vitest'
import { ManageModeration, type ModerationGateway } from './moderation'

function gateway(overrides: Partial<ModerationGateway> = {}): ModerationGateway {
  return { isModerator: vi.fn(), list: vi.fn().mockResolvedValue(null), decide: vi.fn().mockResolvedValue(null), ...overrides }
}

describe('moderation', () => {
  it('forbids non-moderators', async () => {
    const moderation = new ManageModeration(gateway())
    await expect(moderation.list('u', ['open'])).rejects.toMatchObject({ code: 'forbidden' })
    await expect(moderation.decide('u', 'r', { status: 'dismissed', note: '', suspend: false })).rejects.toMatchObject({ code: 'forbidden' })
  })

  it('only suspends when the report is resolved and reports missing reports', async () => {
    const decide = vi.fn().mockResolvedValue('not_found')
    const moderation = new ManageModeration(gateway({ decide }))
    await expect(moderation.decide('m', 'r', { status: 'dismissed', note: '', suspend: true })).rejects.toMatchObject({ code: 'conflict' })
    expect(decide).not.toHaveBeenCalled()
    await expect(moderation.decide('m', 'r', { status: 'resolved', note: '', suspend: true })).rejects.toMatchObject({ code: 'not_found' })
  })
})
