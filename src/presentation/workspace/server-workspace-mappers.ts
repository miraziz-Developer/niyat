import type { CollaborationDetail, ServerOutcomeVerification, ServerTrustSignal } from '../../application/outcomes/server-outcome-verification'
import type { Collaboration, OutcomeVerification, TrustSignal } from '../../domain/model/entities'

export function mapCollaboration(value: CollaborationDetail, actorId: string): Collaboration {
  return {
    id: value.id, introRequestId: value.introRequestId,
    personId: value.creatorId === actorId ? value.counterpartyId : value.creatorId,
    title: value.title, status: value.status, startedAt: value.createdAt,
    milestones: value.milestones.map(item => ({ id: item.id, title: item.title, status: item.status, ...(item.completedAt ? { completedAt: item.completedAt } : {}) })),
  }
}

export function mapVerification(value: ServerOutcomeVerification, actorId: string): OutcomeVerification {
  return { id: value.id, collaborationId: value.collaborationId, personId: value.requesterId === actorId ? value.resolvedBy ?? '' : value.requesterId, evidence: value.evidence, status: value.status, requestedAt: value.requestedAt, ...(value.resolvedAt ? { resolvedAt: value.resolvedAt } : {}) }
}

export function mapTrustSignal(value: ServerTrustSignal): TrustSignal {
  return { id: value.id, collaborationId: value.collaborationId, verificationId: value.verificationId, personId: value.attesterId, label: value.label, issuedAt: value.issuedAt }
}