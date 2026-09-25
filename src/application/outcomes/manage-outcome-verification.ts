import type { Collaboration, OutcomeVerification, TrustSignal } from '../../domain/model/entities'

export function requestOutcomeVerification(
  collaboration: Collaboration,
  evidence: string,
  timestamp: number,
): { collaboration: Collaboration; verification: OutcomeVerification } {
  if (collaboration.status !== 'outcome-ready') {
    throw new Error('Only outcome-ready collaborations can request verification')
  }

  const normalizedEvidence = evidence.trim()
  if (!normalizedEvidence) throw new Error('Outcome evidence is required')

  const verification: OutcomeVerification = {
    id: `verification-${collaboration.id}-${timestamp}`,
    collaborationId: collaboration.id,
    personId: collaboration.personId,
    evidence: normalizedEvidence,
    status: 'pending',
    requestedAt: new Date(timestamp).toISOString(),
  }

  return {
    collaboration: { ...collaboration, status: 'verification-pending' },
    verification,
  }
}

export function resolveOutcomeVerification(
  collaboration: Collaboration,
  verification: OutcomeVerification,
  decision: 'confirmed' | 'disputed',
  timestamp: number,
): { collaboration: Collaboration; verification: OutcomeVerification; trustSignal?: TrustSignal } {
  if (collaboration.id !== verification.collaborationId) throw new Error('Verification does not belong to collaboration')
  if (collaboration.status !== 'verification-pending' || verification.status !== 'pending') {
    throw new Error('Only pending outcome verifications can be resolved')
  }

  const resolvedAt = new Date(timestamp).toISOString()
  const resolvedVerification = { ...verification, status: decision, resolvedAt }
  if (decision === 'disputed') {
    return {
      collaboration: { ...collaboration, status: 'outcome-ready' },
      verification: resolvedVerification,
    }
  }

  return {
    collaboration: { ...collaboration, status: 'verified' },
    verification: resolvedVerification,
    trustSignal: {
      id: `trust-${verification.id}`,
      collaborationId: collaboration.id,
      verificationId: verification.id,
      personId: collaboration.personId,
      label: collaboration.title,
      issuedAt: resolvedAt,
    },
  }
}