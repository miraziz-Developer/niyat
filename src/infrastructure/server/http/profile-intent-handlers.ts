import type { ManageProfiles } from '../../../application/profiles/profile'
import { InvalidCursorError, type IntentInput, type ManageIntents } from '../../../application/intents/intent'
import type { IdempotencyStore, Session, SessionResolver } from '../ports'
import { assertUuid, problem, readEnum, readObject, readString, readStringArray } from './request-validation'
import { HttpError, requireCsrf, requireIdempotencyKey, requireSession } from './security'

type Dependencies = {
  sessions: SessionResolver
  idempotency: IdempotencyStore
  profiles: ManageProfiles
  intents: ManageIntents
  requestId?: () => string
}

type Handler = (request: Request, session: Session, ...ids: string[]) => Promise<Response>

const intentFields = ['title', 'outcome', 'offers', 'needs', 'topics', 'mode', 'horizon', 'visibility', 'status']
const languageTag = /^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$/

export function profileHandler(dependencies: Dependencies) {
  return route(dependencies, {
    GET: async (_request, session) => Response.json(await dependencies.profiles.get(session.userId)),
    PATCH: mutation(dependencies, 'updateMyProfile', async request => {
      const body = await readObject(request, ['displayName', 'bio', 'languages'])
      const languages = readStringArray(body, 'languages', 0, 10, 35)
      if (languages.some(language => !languageTag.test(language))) throw new HttpError(400, 'invalid_request', 'languages must contain BCP 47 language tags', 'languages')
      return { displayName: readString(body, 'displayName', 1, 80), bio: readString(body, 'bio', 0, 1000), languages }
    }, (actorId, input) => dependencies.profiles.update({ actorId, ...input }), 200),
  })
}

export function intentCollectionHandler(dependencies: Dependencies) {
  return route(dependencies, {
    GET: async (request, session) => {
      const { searchParams } = new URL(request.url)
      const limitParam = searchParams.get('limit')
      const limit = limitParam === null ? 20 : Number(limitParam)
      if (!/^\d+$/.test(limitParam ?? '20') || limit < 1 || limit > 100) throw new HttpError(400, 'invalid_request', 'limit must be an integer from 1 to 100', 'limit')
      const cursor = searchParams.get('cursor') ?? undefined
      if (cursor !== undefined && (cursor.length < 1 || cursor.length > 512)) throw new HttpError(400, 'invalid_request', 'cursor is invalid', 'cursor')
      return Response.json(await dependencies.intents.list({ actorId: session.userId, cursor, limit }))
    },
    POST: mutation(dependencies, 'createIntent', readIntentInput, (actorId, input) => dependencies.intents.create({ actorId, input }), 201),
  })
}

export function intentHandler(dependencies: Dependencies) {
  return route(dependencies, {
    GET: async (_request, session, intentId) => {
      assertUuid(intentId, 'intentId')
      return Response.json(await dependencies.intents.get({ actorId: session.userId, intentId }))
    },
    PATCH: mutation(dependencies, 'updateIntent', readIntentInput, (actorId, input, intentId) => dependencies.intents.update({ actorId, intentId, input }), 200),
    DELETE: mutation(dependencies, 'deleteIntent', async () => ({}), async (actorId, _input, intentId) => {
      await dependencies.intents.remove({ actorId, intentId })
      // The idempotency store persists JSON, so a deletion records a marker instead of an empty body.
      return { deleted: true }
    }, 204),
  })
}

function route(dependencies: Dependencies, handlers: Partial<Record<string, Handler>>) {
  return async (request: Request, ...ids: string[]): Promise<Response> => {
    const requestId = dependencies.requestId?.() ?? crypto.randomUUID()
    try {
      const handler = handlers[request.method]
      if (!handler) throw new HttpError(405, 'method_not_allowed', 'Method not allowed')
      const session = await requireSession(request, dependencies.sessions)
      return await handler(request, session, ...ids)
    } catch (error) {
      if (error instanceof InvalidCursorError) return problem(new HttpError(400, 'invalid_request', error.message, 'cursor'), requestId)
      return problem(error, requestId)
    }
  }
}

function mutation<Input, Result>(
  dependencies: Dependencies,
  operation: string,
  parse: (request: Request) => Promise<Input>,
  action: (actorId: string, input: Input, ...ids: string[]) => Promise<Result>,
  successStatus: number,
): Handler {
  return async (request, session, ...ids) => {
    requireCsrf(request, session)
    const key = requireIdempotencyKey(request)
    for (const id of ids) assertUuid(id, 'intentId')
    const input = await parse(request)
    const fingerprint = JSON.stringify({ ids, input })
    const result = await dependencies.idempotency.run(session.userId, operation, key, fingerprint, () => action(session.userId, input, ...ids))
    return successStatus === 204 ? new Response(null, { status: 204 }) : Response.json(result, { status: successStatus })
  }
}

async function readIntentInput(request: Request): Promise<IntentInput> {
  const body = await readObject(request, intentFields)
  return {
    title: readString(body, 'title', 1, 160),
    outcome: readString(body, 'outcome', 1, 2000),
    offers: readStringArray(body, 'offers', 0, 20, 80),
    needs: readStringArray(body, 'needs', 0, 20, 80),
    topics: readStringArray(body, 'topics', 0, 20, 80),
    mode: readEnum(body, 'mode', ['online', 'offline', 'hybrid'] as const),
    horizon: readEnum(body, 'horizon', ['now', 'month', 'quarter'] as const),
    visibility: readEnum(body, 'visibility', ['public', 'matched', 'private'] as const),
    status: readEnum(body, 'status', ['draft', 'active', 'paused', 'completed'] as const),
  }
}
