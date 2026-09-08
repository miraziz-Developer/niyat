import type { IntroRequest } from '../../domain/model/entities'

export function createIntroRequest(personId: string, scope: string, timestamp: number): IntroRequest {
  if (!personId.trim()) throw new Error('Recipient is required')
  if (!scope.trim()) throw new Error('Request scope is required')

  return {
    id: `request-${timestamp}`,
    personId,
    direction: 'outgoing',
    scope: scope.trim(),
    status: 'pending',
    sentAt: 'Hozir',
  }
}

export function transitionIntroRequest(request: IntroRequest, nextStatus: IntroRequest['status']): IntroRequest {
  if (request.status !== 'pending') throw new Error('Only pending requests can change status')
  if (request.direction === 'outgoing' && nextStatus === 'accepted') {
    throw new Error('A sender cannot accept their own request')
  }
  return { ...request, status: nextStatus }
}