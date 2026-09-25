import { describe, expect, it } from 'vitest'
import { assertCounterpartyResolver, assertParticipant } from './server-outcome-verification'

const collaboration = { creatorId: 'creator', counterpartyId: 'counterparty' }

describe('server outcome authorization', () => {
  it('allows either collaboration participant to mutate milestones or request verification', () => {
    expect(() => assertParticipant(collaboration, 'creator')).not.toThrow()
    expect(() => assertParticipant(collaboration, 'counterparty')).not.toThrow()
    expect(() => assertParticipant(collaboration, 'stranger')).toThrow('participants')
  })

  it('requires a distinct counterparty to resolve verification', () => {
    const verification = { requesterId: 'creator' }
    expect(() => assertCounterpartyResolver(collaboration, verification, 'counterparty')).not.toThrow()
    expect(() => assertCounterpartyResolver(collaboration, verification, 'creator')).toThrow('own outcome')
    expect(() => assertCounterpartyResolver(collaboration, verification, 'stranger')).toThrow('participants')
  })
})