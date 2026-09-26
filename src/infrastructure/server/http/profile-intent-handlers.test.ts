import { describe, expect, it, vi } from 'vitest'
import { InvalidCursorError, ManageIntents, type IntentGateway, type ServerIntent } from '../../../application/intents/intent'
import { ManageProfiles, type ProfileGateway } from '../../../application/profiles/profile'
import { MemoryIdempotencyStore } from '../memory-idempotency-store'
import type { SessionResolver } from '../ports'
import { intentCollectionHandler, intentHandler, profileHandler } from './profile-intent-handlers'

const actorId = '00000000-0000-4000-8000-000000000001'
const intentId = '00000000-0000-4000-8000-000000000011'
const csrfToken = 'csrf-secret'
const body = { title: 'Launch', outcome: 'Ship an MVP', offers: ['design'], needs: ['growth'], topics: ['product'], mode: 'online', horizon: 'month', visibility: 'matched', status: 'active' }
const intent = { ...body, id: intentId, ownerId: actorId, createdAt: '2030-01-01T00:00:00.000Z', updatedAt: '2030-01-01T00:00:00.000Z' } as ServerIntent
const sessions: SessionResolver = { resolve: vi.fn().mockResolvedValue({ userId: actorId, csrfToken, expiresAt: '2999-01-01T00:00:00.000Z' }) }

function request(method: string, value?: unknown, headers: Record<string, string> = {}, url = 'https://api.niyat.test/v1/intents') {
  return new Request(url, {
    method,
    ...(value === undefined ? {} : { body: JSON.stringify(value) }),
    headers: { 'content-type': 'application/json', 'X-CSRF-Token': csrfToken, 'Idempotency-Key': 'idempotency-key-1', ...headers },
  })
}

function dependencies(intents: Partial<IntentGateway> = {}, profiles: Partial<ProfileGateway> = {}) {
  const intentGateway: IntentGateway = { create: vi.fn().mockResolvedValue(intent), find: vi.fn().mockResolvedValue(intent), update: vi.fn().mockResolvedValue(intent), remove: vi.fn().mockResolvedValue(true), list: vi.fn(), ...intents }
  const profileGateway: ProfileGateway = { find: vi.fn().mockResolvedValue(null), upsert: vi.fn(async command => ({ userId: command.actorId, displayName: command.displayName, bio: command.bio, languages: command.languages, verificationLevel: 0 })), ...profiles }
  return { sessions, idempotency: new MemoryIdempotencyStore(), intents: new ManageIntents(intentGateway), profiles: new ManageProfiles(profileGateway), requestId: () => 'test-request-id', intentGateway, profileGateway }
}

describe('profile HTTP handler', () => {
  it('returns not_found before a profile exists and upserts only editable fields', async () => {
    const deps = dependencies()
    const handler = profileHandler(deps)
    expect((await handler(request('GET'))).status).toBe(404)

    const spoofed = await handler(request('PATCH', { displayName: 'Ali', bio: '', languages: ['uz'], verificationLevel: 3 }))
    expect(spoofed.status).toBe(400)
    expect(await spoofed.json()).toMatchObject({ field: 'verificationLevel' })

    const updated = await handler(request('PATCH', { displayName: '  Ali ', bio: 'Builder', languages: ['uz', 'en-US', 'uz'] }))
    expect(updated.status).toBe(200)
    expect(await updated.json()).toEqual({ userId: actorId, displayName: 'Ali', bio: 'Builder', languages: ['uz', 'en-US'], verificationLevel: 0 })
    expect(deps.profileGateway.upsert).toHaveBeenCalledOnce()
  })

  it('rejects malformed language tags and missing CSRF tokens', async () => {
    const deps = dependencies()
    const handler = profileHandler(deps)
    expect((await handler(request('PATCH', { displayName: 'Ali', bio: '', languages: ['<script>'] }))).status).toBe(400)
    expect((await handler(request('PATCH', { displayName: 'Ali', bio: '', languages: [] }, { 'X-CSRF-Token': 'wrong' }))).status).toBe(403)
    expect(deps.profileGateway.upsert).not.toHaveBeenCalled()
  })
})

describe('intent HTTP handlers', () => {
  it('creates idempotently and requires every contract field', async () => {
    const deps = dependencies()
    const handler = intentCollectionHandler(deps)
    const { status: _status, ...withoutStatus } = body
    expect(await (await handler(request('POST', withoutStatus))).json()).toMatchObject({ code: 'invalid_request', field: 'status' })

    expect((await handler(request('POST', body))).status).toBe(201)
    expect((await handler(request('POST', body))).status).toBe(201)
    expect(deps.intentGateway.create).toHaveBeenCalledOnce()
    expect(deps.intentGateway.create).toHaveBeenCalledWith({ actorId, input: body })
    expect((await handler(request('POST', { ...body, title: 'Other' }))).status).toBe(409)
  })

  it('maps lifecycle conflicts on create and invalid list parameters', async () => {
    const deps = dependencies({ list: vi.fn().mockRejectedValue(new InvalidCursorError()) })
    const handler = intentCollectionHandler(deps)
    const completed = await handler(request('POST', { ...body, status: 'completed' }, { 'Idempotency-Key': 'idempotency-key-2' }))
    expect(completed.status).toBe(409)
    expect((await handler(new Request('https://api.niyat.test/v1/intents?limit=0'))).status).toBe(400)
    expect((await handler(new Request('https://api.niyat.test/v1/intents?limit=1.5'))).status).toBe(400)
    expect(await (await handler(new Request('https://api.niyat.test/v1/intents?cursor=bogus'))).json()).toMatchObject({ code: 'invalid_request', field: 'cursor' })
  })

  it('returns 204 on delete, replays it, and rejects non-UUID IDs', async () => {
    const deps = dependencies()
    const handler = intentHandler(deps)
    const url = `https://api.niyat.test/v1/intents/${intentId}`
    const first = await handler(request('DELETE', undefined, {}, url), intentId)
    const replay = await handler(request('DELETE', undefined, {}, url), intentId)
    expect([first.status, replay.status]).toEqual([204, 204])
    expect(await first.text()).toBe('')
    expect(deps.intentGateway.remove).toHaveBeenCalledOnce()
    expect((await handler(new Request('https://api.niyat.test/v1/intents/nope'), 'nope')).status).toBe(400)
  })

  it('hides foreign intents as not found', async () => {
    const handler = intentHandler(dependencies({ find: vi.fn().mockResolvedValue(null) }))
    const response = await handler(new Request(`https://api.niyat.test/v1/intents/${intentId}`), intentId)
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ code: 'not_found', message: 'Intent was not found', requestId: 'test-request-id' })
  })
})
