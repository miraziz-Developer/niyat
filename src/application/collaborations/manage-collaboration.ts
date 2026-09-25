import type { Collaboration, IntroRequest } from '../../domain/model/entities'

export function createCollaboration(
  request: IntroRequest,
  title: string,
  milestoneTitles: string[],
  timestamp: number,
): Collaboration {
  if (request.status !== 'accepted') throw new Error('Only accepted intro requests can become collaborations')

  const normalizedTitle = title.trim()
  if (!normalizedTitle) throw new Error('Collaboration title is required')

  const milestones = milestoneTitles
    .map((milestone) => milestone.trim())
    .filter(Boolean)

  if (milestones.length === 0) throw new Error('At least one milestone is required')

  return {
    id: `collaboration-${request.id}`,
    introRequestId: request.id,
    personId: request.personId,
    title: normalizedTitle,
    status: 'active',
    startedAt: new Date(timestamp).toISOString(),
    milestones: milestones.map((milestone, index) => ({
      id: `collaboration-${request.id}-milestone-${index + 1}`,
      title: milestone,
      status: 'pending',
    })),
  }
}

export function completeMilestone(
  collaboration: Collaboration,
  milestoneId: string,
  timestamp: number,
): Collaboration {
  if (collaboration.status !== 'active') throw new Error('Only active collaborations can be updated')

  const milestone = collaboration.milestones.find((candidate) => candidate.id === milestoneId)
  if (!milestone) throw new Error('Milestone does not exist')
  if (milestone.status === 'completed') throw new Error('Milestone is already completed')

  const milestones = collaboration.milestones.map((candidate) => candidate.id === milestoneId
    ? { ...candidate, status: 'completed' as const, completedAt: new Date(timestamp).toISOString() }
    : candidate)

  return {
    ...collaboration,
    milestones,
    status: milestones.every((candidate) => candidate.status === 'completed') ? 'outcome-ready' : 'active',
  }
}