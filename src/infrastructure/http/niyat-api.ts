import type { IntentInput, ServerIntent } from '../../application/intents/intent'
import type { ServerIntroRequest } from '../../application/intros/intro-request'
import type { ServerMatch } from '../../application/matching/server-matching'
import type { CollaborationDetail, ServerTrustSignal, VerificationDecision, VerificationResult } from '../../application/outcomes/server-outcome-verification'
import { NetworkError, type NetworkClient, type ProfileInput, type ServerCollaborationView } from '../../application/ports/network-client'
import type { ServerProfile } from '../../application/profiles/profile'
import type { ReportSubject } from '../../application/safety/safety'

type Session = { userId: string; csrfToken: string; expiresAt: string }
type Page<T> = { items: T[]; page?: { nextCursor: string | null } }
type Problem = { code?: string; message?: string }

export class NiyatApi implements NetworkClient {
  private session: Session | null = null

  constructor(private readonly baseUrl = '/v1', private readonly devUserId = import.meta.env.VITE_DEV_USER_ID) {}

  async connect() {
    try {
      this.session = await this.request<Session>('/session')
    } catch (error) {
      // Private-alpha only: the server refuses this bootstrap in production.
      if (!this.devUserId || !(error instanceof NetworkError) || error.status !== 401) throw error
      this.session = await this.request<Session>('/dev/session', { method: 'POST', headers: { 'X-Dev-User-Id': this.devUserId } })
    }
    const profile = await this.request<ServerProfile>('/me/profile').catch(error => {
      if (error instanceof NetworkError && error.status === 404) return null
      throw error
    })
    return { userId: this.session.userId, profile }
  }

  async requestMagicLink(email: string) {
    await this.request('/auth/magic-link', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) })
  }

  async verifyMagicLink(token: string) {
    this.session = await this.request<Session>('/auth/magic-link/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }) })
  }

  saveProfile(input: ProfileInput) { return this.mutate<ServerProfile>('/me/profile', 'PATCH', input) }
  listIntents() { return this.all<ServerIntent>('/intents') }
  createIntent(input: IntentInput) { return this.mutate<ServerIntent>('/intents', 'POST', input) }
  updateIntent(intentId: string, input: IntentInput) { return this.mutate<ServerIntent>(`/intents/${intentId}`, 'PATCH', input) }
  listMatches(intentId: string) { return this.all<ServerMatch>(`/intents/${intentId}/matches`) }
  async listIntroRequests() { return (await this.request<Page<ServerIntroRequest>>('/intro-requests')).items }
  createIntroRequest(matchId: string, scope: string, message: string) { return this.mutate<ServerIntroRequest>(`/matches/${matchId}/intro-requests`, 'POST', { scope, message }) }
  transitionIntroRequest(requestId: string, status: 'accepted' | 'declined' | 'cancelled') { return this.mutate<ServerIntroRequest>(`/intro-requests/${requestId}`, 'PATCH', { status }) }
  async listCollaborations() { return (await this.request<Page<ServerCollaborationView>>('/me/collaborations')).items }
  async listTrustSignals() { return (await this.request<Page<ServerTrustSignal>>('/me/trust-signals')).items }
  createCollaboration(introRequestId: string, title: string, milestones: string[]) { return this.mutate<CollaborationDetail>(`/intro-requests/${introRequestId}/collaboration`, 'POST', { title, milestones }) }
  completeMilestone(collaborationId: string, milestoneId: string) { return this.mutate<CollaborationDetail>(`/collaborations/${collaborationId}/milestones/${milestoneId}/complete`, 'PATCH') }
  requestVerification(collaborationId: string, evidence: string) { return this.mutate<VerificationResult>(`/collaborations/${collaborationId}/outcome-verifications`, 'POST', { evidence }) }
  resolveVerification(verificationId: string, decision: VerificationDecision) { return this.mutate<VerificationResult>(`/outcome-verifications/${verificationId}`, 'PATCH', { decision }) }
  async block(userId: string, reason?: string) { await this.mutate('/blocks', 'POST', { blockedUserId: userId, ...(reason ? { reason } : {}) }) }
  async report(subjectType: ReportSubject, subjectId: string, reasonCode: string, details?: string) { await this.mutate('/reports', 'POST', { subjectType, subjectId, reasonCode, ...(details ? { details } : {}) }) }

  async signOut() {
    await this.mutate('/session', 'DELETE')
    this.session = null
  }

  /** Follows keyset cursors; the server caps each page, so this stays bounded for alpha-sized collections. */
  private async all<T>(path: string): Promise<T[]> {
    const items: T[] = []
    let cursor: string | null = null
    do {
      const page: Page<T> = await this.request<Page<T>>(`${path}?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`)
      items.push(...page.items)
      cursor = page.page?.nextCursor ?? null
    } while (cursor)
    return items
  }

  private mutate<T>(path: string, method: string, body?: unknown): Promise<T> {
    if (!this.session) return Promise.reject(new NetworkError(401, 'unauthorized', 'Server session is not loaded'))
    return this.request(path, {
      method,
      headers: { 'X-CSRF-Token': this.session.csrfToken, 'Idempotency-Key': crypto.randomUUID(), ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, { credentials: 'same-origin', ...init })
    if (!response.ok) {
      const problem = await response.json().catch(() => ({})) as Problem
      throw new NetworkError(response.status, problem.code ?? 'request_failed', problem.message ?? `Server request failed (${response.status})`)
    }
    return (response.status === 204 ? undefined : await response.json()) as T
  }
}
