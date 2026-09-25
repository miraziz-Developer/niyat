import type { ServerIntroRequest } from '../../application/intros/intro-request'
import type { CollaborationDetail, ServerOutcomeVerification, ServerTrustSignal, VerificationDecision, VerificationResult } from '../../application/outcomes/server-outcome-verification'

export type ServerWorkspace = {
  userId: string
  introRequests: ServerIntroRequest[]
  collaborations: Array<CollaborationDetail & { verification?: ServerOutcomeVerification }>
  trustSignals: ServerTrustSignal[]
}

type Session = { userId: string; csrfToken: string; expiresAt: string }
type Problem = { message?: string }

export class OutcomeVerificationApi {
  private session: Session | null = null
  constructor(private readonly baseUrl = '/v1') {}

  async load(): Promise<ServerWorkspace> {
    this.session = await this.request<Session>('/session')
    const [introRequests, collaborations, trustSignals] = await Promise.all([
      this.request<{ items: ServerIntroRequest[] }>('/intro-requests'),
      this.request<{ items: ServerWorkspace['collaborations'] }>('/me/collaborations'),
      this.request<{ items: ServerTrustSignal[] }>('/me/trust-signals'),
    ])
    return { userId: this.session.userId, introRequests: introRequests.items, collaborations: collaborations.items, trustSignals: trustSignals.items }
  }

  createCollaboration(introRequestId: string, title: string, milestones: string[]): Promise<CollaborationDetail> {
    return this.mutate(`/intro-requests/${introRequestId}/collaboration`, 'POST', { title, milestones })
  }
  completeMilestone(collaborationId: string, milestoneId: string): Promise<CollaborationDetail> {
    return this.mutate(`/collaborations/${collaborationId}/milestones/${milestoneId}/complete`, 'PATCH')
  }
  requestVerification(collaborationId: string, evidence: string): Promise<VerificationResult> {
    return this.mutate(`/collaborations/${collaborationId}/outcome-verifications`, 'POST', { evidence })
  }
  resolveVerification(verificationId: string, decision: VerificationDecision): Promise<VerificationResult> {
    return this.mutate(`/outcome-verifications/${verificationId}`, 'PATCH', { decision })
  }

  private mutate<T>(path: string, method: string, body?: unknown): Promise<T> {
    if (!this.session) return Promise.reject(new Error('Server session is not loaded'))
    return this.request(path, {
      method,
      headers: { 'content-type': 'application/json', 'X-CSRF-Token': this.session.csrfToken, 'Idempotency-Key': crypto.randomUUID() },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, { credentials: 'same-origin', ...init })
    if (!response.ok) {
      const problem = await response.json().catch(() => ({})) as Problem
      throw new Error(problem.message ?? `Server request failed (${response.status})`)
    }
    return response.json() as Promise<T>
  }
}