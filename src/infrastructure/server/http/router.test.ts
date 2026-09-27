import { describe, expect, it, vi } from 'vitest'
import { currentTermsVersion, ManageConsents, type ConsentGateway } from '../../../application/consent/consent'
import { InvalidCursorError, ManageIntents, type IntentGateway, type ServerIntent } from '../../../application/intents/intent'
import { ApplicationError, ManageIntroRequests, type IntroRequestGateway } from '../../../application/intros/intro-request'
import { ManageMatches, type MatchingGateway } from '../../../application/matching/server-matching'
import { ManageOutcomeVerifications, type OutcomeVerificationGateway } from '../../../application/outcomes/server-outcome-verification'
import { ManageModeration, type ModerationGateway } from '../../../application/moderation/moderation'
import { ManageNotificationPreferences } from '../../../application/notifications/notifications'
import { ManageProfiles, type ProfileGateway } from '../../../application/profiles/profile'
import { ManageSafety, type SafetyGateway } from '../../../application/safety/safety'
import { MemoryIdempotencyStore } from '../memory-idempotency-store'
import type { SessionResolver } from '../ports'
import { createApiRouter } from './router'

const actorId = '00000000-0000-4000-8000-000000000001'
const otherId = '00000000-0000-4000-8000-000000000002'
const resourceId = '00000000-0000-4000-8000-000000000003'
const csrf = 'csrf-secret'
const intentBody = { title: 'Launch', outcome: 'Ship an MVP', offers: ['design'], needs: ['growth'], topics: ['product'], mode: 'online', horizon: 'month', visibility: 'matched', status: 'active' }
const intent = { ...intentBody, id: resourceId, ownerId: actorId, createdAt: '2030-01-01T00:00:00.000Z', updatedAt: '2030-01-01T00:00:00.000Z' } as ServerIntent

type Gateways = {
  consents: ConsentGateway
  moderation: ModerationGateway
  profiles: ProfileGateway
  intents: IntentGateway
  matches: MatchingGateway
  intros: IntroRequestGateway
  outcomes: OutcomeVerificationGateway
  safety: SafetyGateway
}

function setup(overrides: { [K in keyof Gateways]?: Partial<Gateways[K]> } = {}, sessions: SessionResolver = session()) {
  const gateways: Gateways = {
    moderation: { isModerator: vi.fn().mockResolvedValue(false), list: vi.fn().mockResolvedValue(null), decide: vi.fn().mockResolvedValue(null), ...overrides.moderation },
    consents: { get: vi.fn().mockResolvedValue({ adultConfirmed: true, termsVersion: currentTermsVersion, acceptedAt: '2030-01-01T00:00:00.000Z' }), accept: vi.fn(async (_actor, termsVersion) => ({ adultConfirmed: true, termsVersion, acceptedAt: '2030-01-01T00:00:00.000Z' })), ...overrides.consents },
    profiles: { find: vi.fn().mockResolvedValue(null), upsert: vi.fn(async command => ({ userId: command.actorId, displayName: command.displayName, bio: command.bio, languages: command.languages, verificationLevel: 1 })), ...overrides.profiles },
    intents: { create: vi.fn().mockResolvedValue(intent), find: vi.fn().mockResolvedValue(intent), update: vi.fn().mockResolvedValue(intent), remove: vi.fn().mockResolvedValue(true), list: vi.fn().mockResolvedValue({ items: [], page: { nextCursor: null } }), ...overrides.intents },
    matches: { refresh: vi.fn().mockResolvedValue(true), list: vi.fn().mockResolvedValue({ items: [], page: { nextCursor: null } }), rate: vi.fn().mockResolvedValue(true), ...overrides.matches },
    intros: { create: vi.fn().mockResolvedValue({ id: resourceId }), transition: vi.fn(), list: vi.fn().mockResolvedValue([]), ...overrides.intros },
    outcomes: { createCollaboration: vi.fn().mockResolvedValue({ id: resourceId }), completeMilestone: vi.fn().mockResolvedValue({ id: resourceId }), requestVerification: vi.fn(), resolveVerification: vi.fn().mockResolvedValue({ verification: { id: resourceId } }), listTrustSignals: vi.fn().mockResolvedValue([]), listCollaborations: vi.fn().mockResolvedValue([]), ...overrides.outcomes },
    safety: { block: vi.fn().mockResolvedValue(true), report: vi.fn().mockResolvedValue({ id: resourceId, status: 'open' }), ...overrides.safety },
  }
  const matches = new ManageMatches(gateways.matches)
  const consents = new ManageConsents(gateways.consents)
  const router = createApiRouter({
    sessions,
    consents,
    consentGate: consents,
    moderation: new ManageModeration(gateways.moderation),
    notificationPreferences: new ManageNotificationPreferences({ get: vi.fn().mockResolvedValue({ introRequests: true, introResponses: true, outcomes: true }), save: vi.fn(async (_actor, value) => value) }),
    idempotency: new MemoryIdempotencyStore(),
    requestId: () => 'request-id',
    profiles: new ManageProfiles(gateways.profiles),
    intents: new ManageIntents(gateways.intents, matches),
    matches,
    intros: new ManageIntroRequests(gateways.intros),
    outcomes: new ManageOutcomeVerifications(gateways.outcomes),
    safety: new ManageSafety(gateways.safety),
  })
  return { router, ...gateways }
}

function session(overrides: Record<string, string> = {}): SessionResolver {
  return { resolve: vi.fn().mockResolvedValue({ userId: actorId, csrfToken: csrf, expiresAt: '2999-01-01T00:00:00.000Z', ...overrides }) }
}

let keyCounter = 0
function send(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  return new Request(`https://api.niyat.test${path}`, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    headers: { 'content-type': 'application/json', 'X-CSRF-Token': csrf, 'Idempotency-Key': `idempotency-key-${String(keyCounter++).padStart(4, '0')}`, ...headers },
  })
}
const get = (path: string) => new Request(`https://api.niyat.test${path}`)

describe('API router: security boundary', () => {
  it('rejects missing or expired sessions before touching a use case', async () => {
    const { router, intents } = setup({}, { resolve: vi.fn().mockResolvedValue(null) })
    expect((await router(get('/v1/intents'))).status).toBe(401)
    const expired = setup({}, session({ expiresAt: '2020-01-01T00:00:00.000Z' }))
    expect((await expired.router(send('POST', '/v1/intents', intentBody))).status).toBe(401)
    expect(intents.list).not.toHaveBeenCalled()
  })

  it('requires CSRF and a well-formed idempotency key on mutations', async () => {
    const { router, intents } = setup()
    const badCsrf = await router(send('POST', '/v1/intents', intentBody, { 'X-CSRF-Token': 'wrong' }))
    expect(badCsrf.status).toBe(403)
    expect(await badCsrf.json()).toMatchObject({ code: 'invalid_csrf_token', requestId: 'request-id' })
    expect((await router(send('POST', '/v1/intents', intentBody, { 'Idempotency-Key': 'short' }))).status).toBe(400)
    expect(intents.create).not.toHaveBeenCalled()
  })

  it('replays identical mutations once and rejects a reused key with a different body', async () => {
    const { router, intents } = setup()
    const headers = { 'Idempotency-Key': 'replayed-key-0001' }
    expect((await router(send('POST', '/v1/intents', intentBody, headers))).status).toBe(201)
    expect((await router(send('POST', '/v1/intents', intentBody, headers))).status).toBe(201)
    expect(intents.create).toHaveBeenCalledOnce()
    const conflict = await router(send('POST', '/v1/intents', { ...intentBody, title: 'Other' }, headers))
    expect(conflict.status).toBe(409)
    expect(await conflict.json()).toMatchObject({ code: 'idempotency_conflict' })
  })

  it('never accepts an actor from the body and validates path parameters', async () => {
    const { router, intros } = setup()
    const spoofed = await router(send('POST', `/v1/matches/${resourceId}/intro-requests`, { scope: 'Call', message: '', actorId: otherId }))
    expect(spoofed.status).toBe(400)
    expect(await spoofed.json()).toMatchObject({ field: 'actorId' })
    expect((await router(send('POST', '/v1/matches/not-a-uuid/intro-requests', { scope: 'Call', message: '' }))).status).toBe(400)
    await router(send('POST', `/v1/matches/${resourceId}/intro-requests`, { scope: ' Call ', message: 'Hi' }))
    expect(intros.create).toHaveBeenCalledWith({ actorId, matchId: resourceId, scope: 'Call', message: 'Hi' })
  })

  it('reports readiness from the database probe', async () => {
    const { router } = setup()
    expect((await router(get('/v1/ready'))).status).toBe(200)
  })

  it('answers unknown routes with 404 and unsupported methods with 405', async () => {
    const { router } = setup()
    expect((await router(get('/v1/nope'))).status).toBe(404)
    expect((await router(send('PUT', `/v1/intents/${resourceId}`, intentBody))).status).toBe(405)
    expect(await (await router(get('/v1/health'))).json()).toEqual({ status: 'ok' })
  })
})

describe('API router: profile and intents', () => {
  it('returns not_found before a profile exists and upserts only editable fields', async () => {
    const { router, profiles } = setup()
    expect((await router(get('/v1/me/profile'))).status).toBe(404)
    const spoofed = await router(send('PATCH', '/v1/me/profile', { displayName: 'Ali', bio: '', languages: ['uz'], verificationLevel: 3 }))
    expect(await spoofed.json()).toMatchObject({ code: 'invalid_request', field: 'verificationLevel' })
    expect((await router(send('PATCH', '/v1/me/profile', { displayName: 'Ali', bio: '', languages: ['<script>'] }))).status).toBe(400)
    const updated = await router(send('PATCH', '/v1/me/profile', { displayName: ' Ali ', bio: 'Builder', languages: ['uz', 'en-US', 'uz'] }))
    expect(await updated.json()).toEqual({ userId: actorId, displayName: 'Ali', bio: 'Builder', languages: ['uz', 'en-US'], verificationLevel: 1 })
    expect(profiles.upsert).toHaveBeenCalledOnce()
  })

  it('creates intents, refreshes their matches, and requires every contract field', async () => {
    const { router, intents, matches } = setup()
    const { status: _status, ...withoutStatus } = intentBody
    expect(await (await router(send('POST', '/v1/intents', withoutStatus))).json()).toMatchObject({ field: 'status' })
    expect((await router(send('POST', '/v1/intents', { ...intentBody, status: 'completed' }))).status).toBe(409)
    expect((await router(send('POST', '/v1/intents', intentBody))).status).toBe(201)
    expect(intents.create).toHaveBeenCalledWith({ actorId, input: intentBody })
    expect(matches.refresh).toHaveBeenCalledWith(actorId, resourceId)
  })

  it('validates list parameters and maps foreign cursors', async () => {
    const { router, intents } = setup({ intents: { list: vi.fn().mockRejectedValue(new InvalidCursorError()) } })
    expect((await router(get('/v1/intents?limit=0'))).status).toBe(400)
    expect((await router(get('/v1/intents?limit=1.5'))).status).toBe(400)
    expect(await (await router(get('/v1/intents?cursor=bogus&limit=5'))).json()).toMatchObject({ field: 'cursor' })
    expect(intents.list).toHaveBeenCalledWith({ actorId, cursor: 'bogus', limit: 5 })
  })

  it('deletes with 204, replays it, and hides foreign intents as not found', async () => {
    const { router, intents } = setup({ intents: { find: vi.fn().mockResolvedValue(null) } })
    const headers = { 'Idempotency-Key': 'delete-intent-key-1' }
    const first = await router(send('DELETE', `/v1/intents/${resourceId}`, undefined, headers))
    const replay = await router(send('DELETE', `/v1/intents/${resourceId}`, undefined, headers))
    expect([first.status, replay.status]).toEqual([204, 204])
    expect(await first.text()).toBe('')
    expect(intents.remove).toHaveBeenCalledOnce()
    expect(await (await router(get(`/v1/intents/${resourceId}`))).json()).toEqual({ code: 'not_found', message: 'Intent was not found', requestId: 'request-id' })
  })

  it('lists matches only for an owned intent', async () => {
    const { router, matches } = setup({ matches: { list: vi.fn().mockResolvedValue(null) } })
    expect((await router(get(`/v1/intents/${resourceId}/matches?limit=10`))).status).toBe(404)
    expect(matches.list).toHaveBeenCalledWith({ actorId, intentId: resourceId, cursor: undefined, limit: 10 })
  })
})

describe('API router: intros and outcomes', () => {
  it('returns the contract page envelope for intro requests', async () => {
    const { router, intros } = setup()
    expect(await (await router(get('/v1/intro-requests'))).json()).toEqual({ items: [], page: { nextCursor: null } })
    expect(intros.list).toHaveBeenCalledWith(actorId)
  })

  it('maps transition authorization failures to the standard problem response', async () => {
    const { router } = setup({ intros: { transition: vi.fn().mockRejectedValue(new ApplicationError('forbidden', 'Only the receiver may accept or decline')) } })
    const response = await router(send('PATCH', `/v1/intro-requests/${resourceId}`, { status: 'accepted' }))
    expect(response.status).toBe(403)
    expect(response.headers.get('content-type')).toContain('application/problem+json')
    expect(await response.json()).toEqual({ code: 'forbidden', message: 'Only the receiver may accept or decline', requestId: 'request-id' })
    expect((await router(send('PATCH', `/v1/intro-requests/${resourceId}`, { status: 'pending' }))).status).toBe(400)
  })

  it('trims collaboration input and dispatches milestone completion without a body', async () => {
    const { router, outcomes } = setup()
    expect((await router(send('POST', `/v1/intro-requests/${resourceId}/collaboration`, { title: ' Sprint ', milestones: [' Demo '] }))).status).toBe(201)
    expect(outcomes.createCollaboration).toHaveBeenCalledWith({ actorId, introRequestId: resourceId, title: 'Sprint', milestones: ['Demo'] })
    const complete = await router(new Request(`https://api.niyat.test/v1/collaborations/${resourceId}/milestones/${resourceId}/complete`, { method: 'PATCH', headers: { 'X-CSRF-Token': csrf, 'Idempotency-Key': '1234567890abcdef' } }))
    expect(complete.status).toBe(200)
    expect(outcomes.completeMilestone).toHaveBeenCalledWith({ actorId, collaborationId: resourceId, milestoneId: resourceId })
  })

  it('replays an idempotent verification decision and reads trust signals for the actor', async () => {
    const { router, outcomes } = setup()
    const headers = { 'Idempotency-Key': 'resolve-verification-1' }
    expect((await router(send('PATCH', `/v1/outcome-verifications/${resourceId}`, { decision: 'confirmed' }, headers))).status).toBe(200)
    expect((await router(send('PATCH', `/v1/outcome-verifications/${resourceId}`, { decision: 'confirmed' }, headers))).status).toBe(200)
    expect(outcomes.resolveVerification).toHaveBeenCalledOnce()
    expect((await router(get('/v1/me/trust-signals'))).status).toBe(200)
    expect(outcomes.listTrustSignals).toHaveBeenCalledWith(actorId)
  })
})

describe('API router: safety', () => {
  it('blocks with 204 and refuses self-blocks and unknown users', async () => {
    const { router, safety } = setup({ safety: { block: vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false) } })
    expect((await router(send('POST', '/v1/blocks', { blockedUserId: otherId.toUpperCase(), reason: 'spam' }))).status).toBe(204)
    expect(safety.block).toHaveBeenCalledWith({ actorId, blockedUserId: otherId, reason: 'spam' })
    expect((await router(send('POST', '/v1/blocks', { blockedUserId: actorId }))).status).toBe(409)
    expect((await router(send('POST', '/v1/blocks', { blockedUserId: resourceId }))).status).toBe(404)
  })

  it('accepts reports for human review and enforces the daily limit', async () => {
    const { router } = setup({ safety: { report: vi.fn().mockResolvedValueOnce({ id: resourceId, status: 'open' }).mockResolvedValueOnce(null) } })
    const accepted = await router(send('POST', '/v1/reports', { subjectType: 'user', subjectId: otherId, reasonCode: 'spam' }))
    expect(accepted.status).toBe(202)
    expect(await accepted.json()).toEqual({ id: resourceId, status: 'open' })
    expect((await router(send('POST', '/v1/reports', { subjectType: 'user', subjectId: otherId, reasonCode: 'spam', details: 'again' }))).status).toBe(429)
    expect((await router(send('POST', '/v1/reports', { subjectType: 'planet', subjectId: otherId, reasonCode: 'spam' }))).status).toBe(400)
  })
})

describe('API router: consent gate', () => {
  const pending = { get: vi.fn().mockResolvedValue({ adultConfirmed: false, termsVersion: null, acceptedAt: null }) }

  it('blocks mutations until 18+ and current terms are accepted, but allows profile and consent', async () => {
    const { router, intents, consents } = setup({ consents: pending })
    const blocked = await router(send('POST', '/v1/intents', intentBody))
    expect(blocked.status).toBe(403)
    expect(await blocked.json()).toMatchObject({ code: 'consent_required' })
    expect(intents.create).not.toHaveBeenCalled()
    expect((await router(send('PATCH', '/v1/me/profile', { displayName: 'Ali', bio: '', languages: [] }))).status).toBe(200)
    expect(await (await router(get('/v1/me/consents'))).json()).toMatchObject({ current: false })
    expect((await router(send('PATCH', '/v1/me/consents', { adultConfirmed: true, termsVersion: 'old' }))).status).toBe(409)
    expect((await router(send('PATCH', '/v1/me/consents', { adultConfirmed: 'yes', termsVersion: currentTermsVersion }))).status).toBe(400)
    const accepted = await router(send('PATCH', '/v1/me/consents', { adultConfirmed: true, termsVersion: currentTermsVersion }))
    expect(await accepted.json()).toMatchObject({ current: true })
    expect(consents.accept).toHaveBeenCalledWith(actorId, currentTermsVersion)
  })

  it('never gates reads', async () => {
    const { router } = setup({ consents: pending })
    expect((await router(get('/v1/intents'))).status).toBe(200)
  })
})

describe('API router: notification preferences', () => {
  it('reads defaults and saves only complete boolean preferences', async () => {
    const { router } = setup()
    expect(await (await router(get('/v1/me/notification-preferences'))).json()).toEqual({ introRequests: true, introResponses: true, outcomes: true })
    expect((await router(send('PATCH', '/v1/me/notification-preferences', { introRequests: false, introResponses: true }))).status).toBe(400)
    const saved = await router(send('PATCH', '/v1/me/notification-preferences', { introRequests: false, introResponses: true, outcomes: false }))
    expect(await saved.json()).toEqual({ introRequests: false, introResponses: true, outcomes: false })
  })
})

describe('API router: moderation', () => {
  it('reports roles and refuses the queue to non-moderators', async () => {
    const { router } = setup()
    expect(await (await router(get('/v1/me/roles'))).json()).toEqual({ moderator: false })
    expect((await router(get('/v1/moderation/reports'))).status).toBe(403)
  })

  it('lets moderators filter the queue and decide with validation', async () => {
    const report = { id: resourceId, status: 'resolved' }
    const { router, moderation } = setup({ moderation: { isModerator: vi.fn().mockResolvedValue(true), list: vi.fn().mockResolvedValue([report]), decide: vi.fn().mockResolvedValue(report) } })
    expect(await (await router(get('/v1/moderation/reports?status=open,resolved'))).json()).toEqual({ items: [report] })
    expect(moderation.list).toHaveBeenCalledWith(actorId, ['open', 'resolved'])
    expect((await router(get('/v1/moderation/reports?status=bogus'))).status).toBe(400)
    expect((await router(send('PATCH', `/v1/moderation/reports/${resourceId}`, { status: 'open' }))).status).toBe(400)
    expect((await router(send('PATCH', `/v1/moderation/reports/${resourceId}`, { status: 'dismissed', suspend: true }))).status).toBe(409)
    expect((await router(send('PATCH', `/v1/moderation/reports/${resourceId}`, { status: 'resolved', note: 'Spam', suspend: true }))).status).toBe(200)
    expect(moderation.decide).toHaveBeenCalledWith(actorId, resourceId, { status: 'resolved', note: 'Spam', suspend: true })
  })
})

describe('API router: match feedback', () => {
  it('records a boolean rating for a visible match', async () => {
    const { router, matches } = setup({ matches: { rate: vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false) } })
    const rated = await router(send('POST', `/v1/matches/${resourceId}/feedback`, { useful: true }))
    expect(await rated.json()).toEqual({ matchId: resourceId, useful: true })
    expect(matches.rate).toHaveBeenCalledWith(actorId, resourceId, true)
    expect((await router(send('POST', `/v1/matches/${resourceId}/feedback`, { useful: false }))).status).toBe(404)
    expect((await router(send('POST', `/v1/matches/${resourceId}/feedback`, { useful: 'yes' }))).status).toBe(400)
  })
})
