import type { ManageConsents } from '../../../application/consent/consent'
import type { IntentInput, ManageIntents } from '../../../application/intents/intent'
import type { ManageIntroRequests } from '../../../application/intros/intro-request'
import type { ManageMatches } from '../../../application/matching/server-matching'
import type { ManageModeration, ReportStatus } from '../../../application/moderation/moderation'
import type { ManageNotificationPreferences } from '../../../application/notifications/notifications'
import type { ManageOutcomeVerifications } from '../../../application/outcomes/server-outcome-verification'
import type { ManageProfiles } from '../../../application/profiles/profile'
import type { ManageSafety } from '../../../application/safety/safety'
import { mutation, noBody, read, type Methods } from './endpoint'
import { assertUuid, readEnum, readObject, readPage, readString, readStringArray } from './request-validation'
import { HttpError } from './security'

export type Services = {
  consents: ManageConsents
  moderation: ManageModeration
  notificationPreferences: ManageNotificationPreferences
  profiles: ManageProfiles
  intents: ManageIntents
  matches: ManageMatches
  intros: ManageIntroRequests
  outcomes: ManageOutcomeVerifications
  safety: ManageSafety
}

export type Resource = { path: string; methods: Methods }

const languageTag = /^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$/

/** Every authenticated resource of the v1 contract. Path parameters are validated as UUIDs by the endpoint. */
export function resources(services: Services): Resource[] {
  const { consents, moderation, notificationPreferences, profiles, intents, matches, intros, outcomes, safety } = services
  return [
    {
      path: '/v1/session',
      methods: { GET: read(async ({ session }) => ({ userId: session.userId, csrfToken: session.csrfToken, expiresAt: session.expiresAt })) },
    },
    {
      path: '/v1/me/profile',
      methods: {
        GET: read(({ actorId }) => profiles.get(actorId)),
        PATCH: mutation('updateMyProfile', 200, readProfileInput, ({ actorId }, input) => profiles.update({ actorId, ...input }), { consentExempt: true }),
      },
    },
    {
      path: '/v1/me/consents',
      methods: {
        GET: read(({ actorId }) => consents.get(actorId)),
        PATCH: mutation('acceptConsents', 200, async request => {
          const body = await readObject(request, ['adultConfirmed', 'termsVersion'])
          if (typeof body.adultConfirmed !== 'boolean') throw new HttpError(400, 'invalid_request', 'adultConfirmed must be a boolean', 'adultConfirmed')
          return { adultConfirmed: body.adultConfirmed, termsVersion: readString(body, 'termsVersion', 1, 40) }
        }, ({ actorId }, input) => consents.accept(actorId, input), { consentExempt: true }),
      },
    },
    {
      path: '/v1/me/notification-preferences',
      methods: {
        GET: read(({ actorId }) => notificationPreferences.get(actorId)),
        PATCH: mutation('updateNotificationPreferences', 200, async request => {
          const body = await readObject(request, ['introRequests', 'introResponses', 'outcomes'])
          for (const field of ['introRequests', 'introResponses', 'outcomes']) {
            if (typeof body[field] !== 'boolean') throw new HttpError(400, 'invalid_request', `${field} must be a boolean`, field)
          }
          return { introRequests: body.introRequests as boolean, introResponses: body.introResponses as boolean, outcomes: body.outcomes as boolean }
        }, ({ actorId }, input) => notificationPreferences.save(actorId, input), { consentExempt: true }),
      },
    },
    {
      path: '/v1/intents',
      methods: {
        GET: read(({ actorId, url }) => intents.list({ actorId, ...readPage(url) })),
        POST: mutation('createIntent', 201, readIntentInput, ({ actorId }, input) => intents.create({ actorId, input })),
      },
    },
    {
      path: '/v1/intents/:intentId',
      methods: {
        GET: read(({ actorId, params }) => intents.get({ actorId, intentId: params.intentId })),
        PATCH: mutation('updateIntent', 200, readIntentInput, ({ actorId, params }, input) => intents.update({ actorId, intentId: params.intentId, input })),
        DELETE: mutation('deleteIntent', 204, noBody, ({ actorId, params }) => intents.remove({ actorId, intentId: params.intentId })),
      },
    },
    {
      path: '/v1/intents/:intentId/matches',
      methods: { GET: read(({ actorId, params, url }) => matches.list({ actorId, intentId: params.intentId, ...readPage(url) })) },
    },
    {
      path: '/v1/matches/:matchId/feedback',
      methods: {
        POST: mutation('rateMatch', 200, async request => {
          const body = await readObject(request, ['useful'])
          if (typeof body.useful !== 'boolean') throw new HttpError(400, 'invalid_request', 'useful must be a boolean', 'useful')
          return { useful: body.useful }
        }, ({ actorId, params }, input) => matches.rate(actorId, params.matchId, input.useful)),
      },
    },
    {
      path: '/v1/matches/:matchId/intro-requests',
      methods: {
        POST: mutation('createIntroRequest', 201, async request => {
          const body = await readObject(request, ['scope', 'message'])
          return { scope: readString(body, 'scope', 1, 200), message: readString(body, 'message', 0, 2000) }
        }, ({ actorId, params }, input) => intros.create({ actorId, matchId: params.matchId, ...input })),
      },
    },
    {
      path: '/v1/intro-requests',
      // The v1 page envelope is kept; a participant's request list is small enough to return whole for now.
      methods: { GET: read(async ({ actorId }) => ({ items: await intros.list(actorId), page: { nextCursor: null } })) },
    },
    {
      path: '/v1/intro-requests/:requestId',
      methods: {
        PATCH: mutation('transitionIntroRequest', 200, async request => {
          const body = await readObject(request, ['status'])
          return { status: readEnum(body, 'status', ['accepted', 'declined', 'cancelled'] as const) }
        }, ({ actorId, params }, input) => intros.transition({ actorId, requestId: params.requestId, ...input })),
      },
    },
    {
      path: '/v1/intro-requests/:introRequestId/collaboration',
      methods: {
        POST: mutation('createCollaboration', 201, async request => {
          const body = await readObject(request, ['title', 'milestones'])
          return { title: readString(body, 'title', 1, 160), milestones: readStringArray(body, 'milestones', 1, 20, 200) }
        }, ({ actorId, params }, input) => outcomes.createCollaboration({ actorId, introRequestId: params.introRequestId, ...input })),
      },
    },
    {
      path: '/v1/me/collaborations',
      methods: { GET: read(async ({ actorId }) => ({ items: await outcomes.listCollaborations(actorId) })) },
    },
    {
      path: '/v1/collaborations/:collaborationId/milestones/:milestoneId/complete',
      methods: {
        PATCH: mutation('completeMilestone', 200, noBody, ({ actorId, params }) =>
          outcomes.completeMilestone({ actorId, collaborationId: params.collaborationId, milestoneId: params.milestoneId })),
      },
    },
    {
      path: '/v1/collaborations/:collaborationId/outcome-verifications',
      methods: {
        POST: mutation('requestOutcomeVerification', 201, async request => {
          const body = await readObject(request, ['evidence'])
          return { evidence: readString(body, 'evidence', 1, 2000) }
        }, ({ actorId, params }, input) => outcomes.requestVerification({ actorId, collaborationId: params.collaborationId, ...input })),
      },
    },
    {
      path: '/v1/outcome-verifications/:verificationId',
      methods: {
        PATCH: mutation('resolveOutcomeVerification', 200, async request => {
          const body = await readObject(request, ['decision'])
          return { decision: readEnum(body, 'decision', ['confirmed', 'disputed'] as const) }
        }, ({ actorId, params }, input) => outcomes.resolveVerification({ actorId, verificationId: params.verificationId, ...input })),
      },
    },
    {
      path: '/v1/me/trust-signals',
      methods: { GET: read(async ({ actorId }) => ({ items: await outcomes.listTrustSignals(actorId) })) },
    },
    {
      path: '/v1/me/roles',
      methods: { GET: read(async ({ actorId }) => ({ moderator: await moderation.isModerator(actorId) })) },
    },
    {
      path: '/v1/moderation/reports',
      methods: {
        GET: read(({ actorId, url }) => {
          const requested = (url.searchParams.get('status') ?? 'open,reviewing').split(',')
          const statuses = requested.filter((value): value is ReportStatus => ['open', 'reviewing', 'resolved', 'dismissed'].includes(value))
          if (!statuses.length || statuses.length !== requested.length) throw new HttpError(400, 'invalid_request', 'status must list open, reviewing, resolved or dismissed', 'status')
          return moderation.list(actorId, statuses).then(items => ({ items }))
        }),
      },
    },
    {
      path: '/v1/moderation/reports/:reportId',
      methods: {
        PATCH: mutation('decideReport', 200, async request => {
          const body = await readObject(request, ['status', 'note', 'suspend'], ['status'])
          if (body.suspend !== undefined && typeof body.suspend !== 'boolean') throw new HttpError(400, 'invalid_request', 'suspend must be a boolean', 'suspend')
          return {
            status: readEnum(body, 'status', ['reviewing', 'resolved', 'dismissed'] as const),
            note: body.note === undefined ? '' : readString(body, 'note', 0, 2000),
            suspend: body.suspend === true,
          }
        }, ({ actorId, params }, input) => moderation.decide(actorId, params.reportId, input)),
      },
    },
    {
      path: '/v1/blocks',
      methods: {
        POST: mutation('createBlock', 204, async request => {
          const body = await readObject(request, ['blockedUserId', 'reason'], ['blockedUserId'])
          const blockedUserId = readString(body, 'blockedUserId', 36, 36)
          assertUuid(blockedUserId, 'blockedUserId')
          return { blockedUserId: blockedUserId.toLowerCase(), ...(body.reason === undefined ? {} : { reason: readString(body, 'reason', 0, 500) }) }
        }, ({ actorId }, input) => safety.block({ actorId, ...input })),
      },
    },
    {
      path: '/v1/reports',
      methods: {
        POST: mutation('createReport', 202, async request => {
          const body = await readObject(request, ['subjectType', 'subjectId', 'reasonCode', 'details'], ['subjectType', 'subjectId', 'reasonCode'])
          const subjectId = readString(body, 'subjectId', 36, 36)
          assertUuid(subjectId, 'subjectId')
          return {
            subjectType: readEnum(body, 'subjectType', ['user', 'intent', 'intro_request'] as const),
            subjectId: subjectId.toLowerCase(),
            reasonCode: readString(body, 'reasonCode', 1, 80),
            details: body.details === undefined ? '' : readString(body, 'details', 0, 2000),
          }
        }, ({ actorId }, input) => safety.report({ actorId, ...input })),
      },
    },
  ]
}

async function readProfileInput(request: Request) {
  const body = await readObject(request, ['displayName', 'bio', 'languages'])
  const languages = readStringArray(body, 'languages', 0, 10, 35)
  if (languages.some(language => !languageTag.test(language))) throw new HttpError(400, 'invalid_request', 'languages must contain BCP 47 language tags', 'languages')
  return { displayName: readString(body, 'displayName', 1, 80), bio: readString(body, 'bio', 0, 1000), languages }
}

async function readIntentInput(request: Request): Promise<IntentInput> {
  const body = await readObject(request, ['title', 'outcome', 'offers', 'needs', 'topics', 'mode', 'horizon', 'visibility', 'status'])
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
