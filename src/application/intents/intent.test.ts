import { describe, expect, it, vi } from 'vitest'
import { assertIntentCreationStatus, assertIntentTransition, ManageIntents, type IntentGateway, type IntentInput, type ServerIntent } from './intent'

const input: IntentInput = { title: 'Launch', outcome: 'Ship an MVP', offers: ['design', 'design'], needs: ['growth'], topics: [], mode: 'online', horizon: 'month', visibility: 'matched', status: 'active' }
const intent: ServerIntent = { ...input, id: 'intent', ownerId: 'owner', createdAt: '2030-01-01T00:00:00.000Z', updatedAt: '2030-01-01T00:00:00.000Z' }

function gateway(overrides: Partial<IntentGateway> = {}): IntentGateway {
  return { create: vi.fn().mockResolvedValue(intent), find: vi.fn().mockResolvedValue(null), update: vi.fn(), remove: vi.fn().mockResolvedValue(false), list: vi.fn(), ...overrides }
}

describe('intent lifecycle policy', () => {
  it('starts intents only as draft or active', () => {
    expect(() => assertIntentCreationStatus('draft')).not.toThrow()
    expect(() => assertIntentCreationStatus('active')).not.toThrow()
    expect(() => assertIntentCreationStatus('completed')).toThrow('draft or active')
  })

  it('never returns a published intent to draft and keeps completed intents immutable', () => {
    expect(() => assertIntentTransition('draft', 'active')).not.toThrow()
    expect(() => assertIntentTransition('paused', 'active')).not.toThrow()
    expect(() => assertIntentTransition('active', 'draft')).toThrow('from active to draft')
    expect(() => assertIntentTransition('draft', 'paused')).toThrow('from draft to paused')
    expect(() => assertIntentTransition('completed', 'completed')).toThrow('no longer be changed')
    expect(() => assertIntentTransition('expired', 'active')).toThrow('no longer be changed')
  })

  it('deduplicates tags and hides missing or foreign intents behind not_found', async () => {
    const create = vi.fn().mockResolvedValue(intent)
    const intents = new ManageIntents(gateway({ create }))
    await intents.create({ actorId: 'owner', input })
    expect(create).toHaveBeenCalledWith({ actorId: 'owner', input: { ...input, offers: ['design'] } })
    await expect(intents.get({ actorId: 'stranger', intentId: 'intent' })).rejects.toMatchObject({ code: 'not_found' })
    await expect(intents.remove({ actorId: 'stranger', intentId: 'intent' })).rejects.toMatchObject({ code: 'not_found' })
  })

  it('runs the transition check against the locked current row', async () => {
    const update = vi.fn(async (_command, assertTransition: (current: ServerIntent) => void) => { assertTransition({ ...intent, status: 'completed' }); return intent })
    await expect(new ManageIntents(gateway({ update })).update({ actorId: 'owner', intentId: 'intent', input })).rejects.toMatchObject({ code: 'conflict' })
  })
})
