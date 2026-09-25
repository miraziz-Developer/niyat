import { describe, expect, it } from 'vitest'
import type { IntroRequest } from '../../domain/model/entities'
import { completeMilestone, createCollaboration } from './manage-collaboration'

const acceptedIntro: IntroRequest = {
  id: 'intro-1',
  personId: 'person-1',
  direction: 'incoming',
  scope: 'Prototype yaratish',
  status: 'accepted',
  sentAt: 'Hozir',
}

describe('collaboration lifecycle', () => {
  it('starts a collaboration from an accepted intro', () => {
    const collaboration = createCollaboration(acceptedIntro, '  Prototype sprint  ', [' Kickoff ', 'Demo'], 0)

    expect(collaboration).toMatchObject({
      id: 'collaboration-intro-1',
      personId: 'person-1',
      title: 'Prototype sprint',
      status: 'active',
      startedAt: '1970-01-01T00:00:00.000Z',
    })
    expect(collaboration.milestones.map((milestone) => milestone.title)).toEqual(['Kickoff', 'Demo'])
  })

  it('rejects an intro without mutual consent', () => {
    const pendingIntro = { ...acceptedIntro, status: 'pending' as const }

    expect(() => createCollaboration(pendingIntro, 'Sprint', ['Kickoff'], 0)).toThrow('accepted')
  })

  it('requires a title and at least one milestone', () => {
    expect(() => createCollaboration(acceptedIntro, ' ', ['Kickoff'], 0)).toThrow('title')
    expect(() => createCollaboration(acceptedIntro, 'Sprint', [' ', ''], 0)).toThrow('milestone')
  })

  it('moves to outcome-ready after the final milestone', () => {
    const collaboration = createCollaboration(acceptedIntro, 'Sprint', ['Kickoff'], 0)
    const completed = completeMilestone(collaboration, collaboration.milestones[0].id, 1_000)

    expect(completed.status).toBe('outcome-ready')
    expect(completed.milestones[0]).toMatchObject({
      status: 'completed',
      completedAt: '1970-01-01T00:00:01.000Z',
    })
  })

  it('rejects unknown or already completed milestones', () => {
    const collaboration = createCollaboration(acceptedIntro, 'Sprint', ['Kickoff'], 0)
    expect(() => completeMilestone(collaboration, 'unknown', 1)).toThrow('does not exist')

    const completed = completeMilestone(collaboration, collaboration.milestones[0].id, 1)
    expect(() => completeMilestone(completed, collaboration.milestones[0].id, 2)).toThrow('active')
  })
})