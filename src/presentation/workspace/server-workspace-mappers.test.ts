import { describe, expect, it } from 'vitest'
import type { ServerMatch } from '../../application/matching/server-matching'
import { mapServerIntro, mapServerMatch, mapVerification, personFromCounterpart, uniquePeople } from './server-workspace-mappers'

const counterpart = { userId: 'user-2', displayName: null, verificationLevel: 0, intent: { id: 'intent-2', title: 'Design studio', outcome: 'Ship', offers: ['design'], needs: ['engineering'], topics: ['ai'], mode: 'online' as const, horizon: 'month' as const } }

describe('server workspace mappers', () => {
  it('keeps identity anonymous until the server reveals a name', () => {
    expect(personFromCounterpart(counterpart)).toMatchObject({ id: 'user-2', name: 'Anonim hamkor', initials: '?' })
    expect(personFromCounterpart({ ...counterpart, displayName: 'Aziza Karimova', verificationLevel: 1 })).toMatchObject({ name: 'Aziza Karimova', initials: 'AK', role: 'Tasdiqlangan a’zo' })
  })

  it('carries match id, limitations and existing intro into the view model', () => {
    const match: ServerMatch = { id: 'match', leftIntentId: 'a', rightIntentId: 'b', score: 77.4, status: 'shown', youReceive: ['design'], theyReceive: ['engineering'], reasons: ['Ishlash formati mos'], limitations: ['Umumiy mavzu topilmadi'], counterpart, intro: { id: 'intro', status: 'pending', direction: 'outgoing' } }
    expect(mapServerMatch(match, 'Builder')).toMatchObject({ matchId: 'match', introId: 'intro', score: 77, limitations: ['Umumiy mavzu topilmadi'] })
  })

  it('maps intro direction and folds terminal statuses into declined', () => {
    const intro = { id: 'intro', matchId: 'match', senderId: 'user-2', receiverId: 'me', scope: 'Call', message: '', status: 'expired' as const, expiresAt: '2030-01-08T00:00:00Z', createdAt: '2030-01-01T00:00:00Z', counterpart: null }
    expect(mapServerIntro(intro, 'me')).toMatchObject({ request: { personId: 'user-2', direction: 'incoming', status: 'declined' }, person: null })
  })

  it('asks only the counterparty for a verification decision', () => {
    const collaboration = { id: 'c', introRequestId: 'i', personId: 'user-2', title: 'Sprint', status: 'verification-pending' as const, startedAt: '', milestones: [] }
    const verification = { id: 'v', collaborationId: 'c', requesterId: 'user-2', evidence: 'Demo', status: 'pending' as const, requestedAt: '' }
    expect(mapVerification(verification, collaboration, 'me').awaitingMyDecision).toBe(true)
    expect(mapVerification({ ...verification, requesterId: 'me' }, collaboration, 'me').awaitingMyDecision).toBe(false)
  })

  it('prefers a revealed identity over an anonymous duplicate', () => {
    const anonymous = personFromCounterpart(counterpart)
    const revealed = personFromCounterpart({ ...counterpart, displayName: 'Aziza' })
    expect(uniquePeople([revealed, anonymous, null])).toEqual([revealed])
    expect(uniquePeople([anonymous, revealed])).toEqual([revealed])
  })
})
