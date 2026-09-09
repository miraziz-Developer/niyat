import { describe, expect, it } from 'vitest'
import type { IntroRequest } from '../../domain/model/entities'
import { createIntroRequest, transitionIntroRequest } from './manage-intro-request'

describe('intro request lifecycle', () => {
  it('creates a pending outgoing request', () => {
    expect(createIntroRequest('person-1', '15 minute call', 42)).toMatchObject({
      id: 'request-42',
      personId: 'person-1',
      status: 'pending',
      direction: 'outgoing',
    })
  })

  it('lets a receiver accept a pending request', () => {
    const incoming: IntroRequest = { id: 'r1', personId: 'p1', direction: 'incoming', scope: 'Call', status: 'pending', sentAt: 'Now' }
    expect(transitionIntroRequest(incoming, 'accepted').status).toBe('accepted')
  })

  it('prevents senders from accepting their own request', () => {
    const outgoing = createIntroRequest('p1', 'Call', 1)
    expect(() => transitionIntroRequest(outgoing, 'accepted')).toThrow('cannot accept')
  })

  it('prevents terminal requests from transitioning again', () => {
    const declined: IntroRequest = { id: 'r1', personId: 'p1', direction: 'incoming', scope: 'Call', status: 'declined', sentAt: 'Now' }
    expect(() => transitionIntroRequest(declined, 'accepted')).toThrow('pending')
  })

  it('prevents a pending request from transitioning to itself', () => {
    const incoming: IntroRequest = { id: 'r1', personId: 'p1', direction: 'incoming', scope: 'Call', status: 'pending', sentAt: 'Now' }
    expect(() => transitionIntroRequest(incoming, 'pending')).toThrow('back to pending')
  })
})