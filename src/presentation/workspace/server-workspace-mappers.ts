import type { ServerIntroRequest } from '../../application/intros/intro-request'
import type { MatchCounterpart, ServerMatch } from '../../application/matching/server-matching'
import type { CollaborationDetail, ServerOutcomeVerification, ServerTrustSignal } from '../../application/outcomes/server-outcome-verification'
import type { Collaboration, IntroRequest, Match, OutcomeVerification, Person, TrustSignal } from '../../domain/model/entities'
import { formatShortDate } from '../shared/format-date'

const accents = ['#c8ff62', '#8aa8ff', '#ff8f70', '#e5a8ff', '#70e1d0', '#ffd166']

type Counterpart = Pick<MatchCounterpart, 'userId' | 'displayName' | 'verificationLevel'> & { intent: Partial<MatchCounterpart['intent']> & { id: string; title: string; offers: string[]; needs: string[] } }

/** Identity is shown only when the server revealed it after mutual consent. */
export function personFromCounterpart(counterpart: Counterpart): Person {
  const name = counterpart.displayName ?? 'Anonim hamkor'
  return {
    id: counterpart.userId,
    name,
    role: counterpart.verificationLevel > 0 ? 'Tasdiqlangan a’zo' : 'Yangi a’zo',
    city: counterpart.displayName ? 'Aloqa ochiq' : 'Ism rozilikdan keyin ochiladi',
    initials: counterpart.displayName ? initials(counterpart.displayName) : '?',
    accent: accents[hash(counterpart.userId) % accents.length],
    intent: {
      id: counterpart.intent.id,
      title: counterpart.intent.title,
      outcome: counterpart.intent.outcome ?? '',
      offers: counterpart.intent.offers,
      needs: counterpart.intent.needs,
      topics: counterpart.intent.topics ?? [],
      location: '',
      mode: counterpart.intent.mode ?? 'hybrid',
      horizon: counterpart.intent.horizon ?? 'month',
      visibility: 'network',
    },
  }
}

export function unknownPerson(id: string): Person {
  return { id, name: 'Yashirilgan foydalanuvchi', role: 'Mavjud emas', city: '—', initials: '·', accent: '#3a403b', intent: { id, title: 'Ma’lumot yashirilgan', outcome: '', offers: [], needs: [], topics: [], location: '', mode: 'hybrid', horizon: 'month', visibility: 'network' } }
}

export function mapServerMatch(value: ServerMatch, viewerIntentTitle: string): Match {
  const person = personFromCounterpart(value.counterpart)
  return {
    person,
    score: Math.round(value.score),
    reasons: value.reasons,
    limitations: value.limitations,
    youReceive: value.youReceive,
    theyReceive: value.theyReceive,
    matchId: value.id,
    ...(value.intro ? { introId: value.intro.id } : {}),
    opening: `Salom. “${viewerIntentTitle}” ustida ishlayapman. Sizning “${person.intent.title}” niyatingiz bilan o‘zaro foydali nuqta ko‘rdim. 15 daqiqa fikr almashamizmi?`,
  }
}

export function mapServerIntro(value: ServerIntroRequest, actorId: string): { request: IntroRequest; person: Person | null } {
  const outgoing = value.senderId === actorId
  return {
    request: {
      id: value.id,
      personId: value.counterpart?.userId ?? (outgoing ? value.receiverId : value.senderId),
      direction: outgoing ? 'outgoing' : 'incoming',
      scope: value.scope,
      status: value.status === 'cancelled' || value.status === 'expired' ? 'declined' : value.status,
      sentAt: formatShortDate(value.createdAt),
    },
    person: value.counterpart ? personFromCounterpart(value.counterpart) : null,
  }
}

export function mapCollaboration(value: CollaborationDetail, actorId: string): Collaboration {
  return {
    id: value.id, introRequestId: value.introRequestId,
    personId: value.creatorId === actorId ? value.counterpartyId : value.creatorId,
    title: value.title, status: value.status, startedAt: value.createdAt,
    milestones: value.milestones.map(item => ({ id: item.id, title: item.title, status: item.status, ...(item.completedAt ? { completedAt: item.completedAt } : {}) })),
  }
}

export function mapVerification(value: ServerOutcomeVerification, collaboration: Collaboration, actorId: string): OutcomeVerification {
  return {
    id: value.id, collaborationId: value.collaborationId, personId: collaboration.personId, evidence: value.evidence, status: value.status,
    requestedAt: value.requestedAt, ...(value.resolvedAt ? { resolvedAt: value.resolvedAt } : {}),
    awaitingMyDecision: value.status === 'pending' && value.requesterId !== actorId,
  }
}

export function mapTrustSignal(value: ServerTrustSignal): TrustSignal {
  return { id: value.id, collaborationId: value.collaborationId, verificationId: value.verificationId, personId: value.attesterId, label: value.label, issuedAt: value.issuedAt }
}

export function uniquePeople(people: Array<Person | null>): Person[] {
  const byId = new Map<string, Person>()
  // Later entries win, so a revealed identity (from an accepted intro) replaces an anonymous one.
  for (const person of people) if (person && (!byId.has(person.id) || person.initials !== '?')) byId.set(person.id, person)
  return [...byId.values()]
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]!.toUpperCase()).join('') || '?'
}

function hash(value: string) {
  let result = 0
  for (const character of value) result = (result * 31 + character.charCodeAt(0)) >>> 0
  return result
}
