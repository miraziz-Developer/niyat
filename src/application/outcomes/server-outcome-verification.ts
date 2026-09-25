import { ApplicationError } from '../intros/intro-request'

export type ServerCollaborationStatus = 'active' | 'outcome-ready' | 'verification-pending' | 'verified'
export type VerificationDecision = 'confirmed' | 'disputed'

export type ServerCollaboration = {
  id: string
  introRequestId: string
  creatorId: string
  counterpartyId: string
  title: string
  status: ServerCollaborationStatus
  createdAt: string
}

export type ServerMilestone = {
  id: string
  collaborationId: string
  title: string
  position: number
  status: 'pending' | 'completed'
  completedAt?: string
}

export type ServerOutcomeVerification = {
  id: string
  collaborationId: string
  requesterId: string
  evidence: string
  status: 'pending' | VerificationDecision
  requestedAt: string
  resolvedAt?: string
  resolvedBy?: string
}

export type ServerTrustSignal = {
  id: string
  collaborationId: string
  verificationId: string
  subjectId: string
  attesterId: string
  label: string
  issuedAt: string
}

export type CollaborationDetail = ServerCollaboration & { milestones: ServerMilestone[] }
export type VerificationResult = { collaboration: ServerCollaboration; verification: ServerOutcomeVerification; trustSignal?: ServerTrustSignal }

export interface OutcomeVerificationGateway {
  createCollaboration(command: { actorId: string; introRequestId: string; title: string; milestones: string[] }): Promise<CollaborationDetail>
  completeMilestone(command: { actorId: string; collaborationId: string; milestoneId: string }): Promise<CollaborationDetail>
  requestVerification(command: { actorId: string; collaborationId: string; evidence: string }): Promise<VerificationResult>
  resolveVerification(command: { actorId: string; verificationId: string; decision: VerificationDecision }): Promise<VerificationResult>
  listTrustSignals(actorId: string): Promise<ServerTrustSignal[]>
  listCollaborations(actorId: string): Promise<Array<CollaborationDetail & { verification?: ServerOutcomeVerification }>>
}

export function assertParticipant(collaboration: Pick<ServerCollaboration, 'creatorId' | 'counterpartyId'>, actorId: string): void {
  if (actorId !== collaboration.creatorId && actorId !== collaboration.counterpartyId) {
    throw new ApplicationError('forbidden', 'Only collaboration participants may perform this action')
  }
}

export function assertCounterpartyResolver(
  collaboration: Pick<ServerCollaboration, 'creatorId' | 'counterpartyId'>,
  verification: Pick<ServerOutcomeVerification, 'requesterId'>,
  actorId: string,
): void {
  assertParticipant(collaboration, actorId)
  if (actorId === verification.requesterId) {
    throw new ApplicationError('forbidden', 'The requester cannot verify their own outcome')
  }
}

export class ManageOutcomeVerifications {
  constructor(private readonly gateway: OutcomeVerificationGateway) {}

  createCollaboration(command: Parameters<OutcomeVerificationGateway['createCollaboration']>[0]) { return this.gateway.createCollaboration(command) }
  completeMilestone(command: Parameters<OutcomeVerificationGateway['completeMilestone']>[0]) { return this.gateway.completeMilestone(command) }
  requestVerification(command: Parameters<OutcomeVerificationGateway['requestVerification']>[0]) { return this.gateway.requestVerification(command) }
  resolveVerification(command: Parameters<OutcomeVerificationGateway['resolveVerification']>[0]) { return this.gateway.resolveVerification(command) }
  listTrustSignals(actorId: string) { return this.gateway.listTrustSignals(actorId) }
  listCollaborations(actorId: string) { return this.gateway.listCollaborations(actorId) }
}