import { describe, expect, it } from 'vitest'
import { assertIntroTransitionActor } from './intro-request'

const senderId = '00000000-0000-4000-8000-000000000001'
const receiverId = '00000000-0000-4000-8000-000000000002'

describe('intro request actor policy', () => {
  it('allows only receivers to accept or decline', () => {
    expect(() => assertIntroTransitionActor({ senderId, receiverId }, { actorId: receiverId, status: 'accepted' })).not.toThrow()
    expect(() => assertIntroTransitionActor({ senderId, receiverId }, { actorId: senderId, status: 'declined' })).toThrow('Only the receiver')
  })

  it('allows only senders to cancel', () => {
    expect(() => assertIntroTransitionActor({ senderId, receiverId }, { actorId: senderId, status: 'cancelled' })).not.toThrow()
    expect(() => assertIntroTransitionActor({ senderId, receiverId }, { actorId: receiverId, status: 'cancelled' })).toThrow('Only the sender')
  })
})