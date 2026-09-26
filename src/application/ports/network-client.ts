import type { IntentInput, ServerIntent } from '../intents/intent'
import type { IntroRequestStatus, ServerIntroRequest } from '../intros/intro-request'
import type { ServerMatch } from '../matching/server-matching'
import type { CollaborationDetail, ServerOutcomeVerification, ServerTrustSignal, VerificationDecision, VerificationResult } from '../outcomes/server-outcome-verification'
import type { ServerProfile } from '../profiles/profile'
import type { ReportSubject } from '../safety/safety'

export type ServerCollaborationView = CollaborationDetail & { verification?: ServerOutcomeVerification }
export type ProfileInput = Pick<ServerProfile, 'displayName' | 'bio' | 'languages'>

/** The authenticated NIYAT API as the browser sees it. Presentation depends on this port, never on fetch. */
export interface NetworkClient {
  connect(): Promise<{ userId: string; profile: ServerProfile | null }>
  saveProfile(input: ProfileInput): Promise<ServerProfile>
  listIntents(): Promise<ServerIntent[]>
  createIntent(input: IntentInput): Promise<ServerIntent>
  updateIntent(intentId: string, input: IntentInput): Promise<ServerIntent>
  listMatches(intentId: string): Promise<ServerMatch[]>
  listIntroRequests(): Promise<ServerIntroRequest[]>
  createIntroRequest(matchId: string, scope: string, message: string): Promise<ServerIntroRequest>
  transitionIntroRequest(requestId: string, status: Extract<IntroRequestStatus, 'accepted' | 'declined' | 'cancelled'>): Promise<ServerIntroRequest>
  listCollaborations(): Promise<ServerCollaborationView[]>
  listTrustSignals(): Promise<ServerTrustSignal[]>
  createCollaboration(introRequestId: string, title: string, milestones: string[]): Promise<CollaborationDetail>
  completeMilestone(collaborationId: string, milestoneId: string): Promise<CollaborationDetail>
  requestVerification(collaborationId: string, evidence: string): Promise<VerificationResult>
  resolveVerification(verificationId: string, decision: VerificationDecision): Promise<VerificationResult>
  block(userId: string, reason?: string): Promise<void>
  report(subjectType: ReportSubject, subjectId: string, reasonCode: string, details?: string): Promise<void>
  signOut(): Promise<void>
}

export class NetworkError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message)
    this.name = 'NetworkError'
  }
}
