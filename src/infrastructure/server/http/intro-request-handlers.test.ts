import { describe, expect, it, vi } from 'vitest'
import { ApplicationError, ManageIntroRequests, type IntroRequestGateway, type ServerIntroRequest } from '../../../application/intros/intro-request'
import { MemoryIdempotencyStore } from '../memory-idempotency-store'
import type { SessionResolver } from '../ports'
import { createIntroRequestHandler, transitionIntroRequestHandler } from './intro-request-handlers'

const actorId = '00000000-0000-4000-8000-000000000001'
const matchId = '00000000-0000-4000-8000-000000000002'
const requestId = '00000000-0000-4000-8000-000000000003'
const csrfToken = 'csrf-secret'
const idempotencyKey = 'idempotency-key-1'

const intro: ServerIntroRequest = {
  id: requestId,
  matchId,
  senderId: actorId,
  receiverId: '00000000-0000-4000-8000-000000000004',
  scope: '15 minute call',
  message: 'Hello',
  status: 'pending',
  expiresAt: '2030-01-08T00:00:00.000Z',
  createdAt: '2030-01-01T00:00:00.000Z',
}

function resolver(overrides: Partial<Awaited<ReturnType<SessionResolver['resolve']>>> = {}): SessionResolver {
  return { resolve: vi.fn().mockResolvedValue({ userId: actorId, csrfToken, expiresAt: '2999-01-01T00:00:00.000Z', ...overrides }) }
}

function request(method: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request('https://api.niyat.test/v1/resource', {
    method,
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', 'X-CSRF-Token': csrfToken, 'Idempotency-Key': idempotencyKey, ...headers },
  })
}

function dependencies(gateway: IntroRequestGateway, sessions: SessionResolver = resolver()) {
  return { sessions, idempotency: new MemoryIdempotencyStore(), intros: new ManageIntroRequests(gateway), requestId: () => 'test-request-id' }
}

describe('intro request HTTP handlers', () => {
  it('uses the authenticated actor and replays the same idempotent create result', async () => {
    const create = vi.fn().mockResolvedValue(intro)
    const handler = createIntroRequestHandler(dependencies({ create, transition: vi.fn() }))

    const first = await handler(request('POST', { scope: intro.scope, message: intro.message, actorId: 'spoofed' }), matchId)
    expect(first.status).toBe(400)

    const validBody = { scope: intro.scope, message: intro.message }
    const accepted = await handler(request('POST', validBody), matchId)
    const replayed = await handler(request('POST', validBody), matchId)
    expect(accepted.status).toBe(201)
    expect(replayed.status).toBe(201)
    expect(create).toHaveBeenCalledOnce()
    expect(create).toHaveBeenCalledWith({ actorId, matchId, ...validBody })

    const conflict = await handler(request('POST', { scope: 'Different call', message: intro.message }), matchId)
    expect(conflict.status).toBe(409)
    expect(await conflict.json()).toMatchObject({ code: 'idempotency_conflict' })
    expect(create).toHaveBeenCalledOnce()
  })

  it('rejects invalid security headers before invoking the use case', async () => {
    const create = vi.fn()
    const handler = createIntroRequestHandler(dependencies({ create, transition: vi.fn() }))
    const response = await handler(request('POST', { scope: 'Call', message: '' }, { 'X-CSRF-Token': 'wrong' }), matchId)
    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ code: 'invalid_csrf_token', requestId: 'test-request-id' })
    expect(create).not.toHaveBeenCalled()
  })

  it('rejects expired sessions', async () => {
    const create = vi.fn()
    const handler = createIntroRequestHandler(dependencies({ create, transition: vi.fn() }, resolver({ expiresAt: '2020-01-01T00:00:00.000Z' })))
    const response = await handler(request('POST', { scope: 'Call', message: '' }), matchId)
    expect(response.status).toBe(401)
    expect(create).not.toHaveBeenCalled()
  })

  it('maps transition authorization failures to the standard problem response', async () => {
    const transition = vi.fn().mockRejectedValue(new ApplicationError('forbidden', 'Only the receiver may accept or decline'))
    const handler = transitionIntroRequestHandler(dependencies({ create: vi.fn(), transition }))
    const response = await handler(request('PATCH', { status: 'accepted' }), requestId)
    expect(response.status).toBe(403)
    expect(response.headers.get('content-type')).toContain('application/problem+json')
    expect(await response.json()).toEqual({ code: 'forbidden', message: 'Only the receiver may accept or decline', requestId: 'test-request-id' })
  })
})