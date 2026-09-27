import { ApplicationError } from '../intros/intro-request'
import type { IntentInput } from '../intents/intent'

export type MatchStatus = 'candidate' | 'shown' | 'dismissed' | 'intro_requested' | 'connected'

/** What an actor may learn about the other side of a match. Identity stays hidden until an intro is accepted. */
export type MatchCounterpart = {
  userId: string
  displayName: string | null
  verificationLevel: number
  intent: Pick<IntentInput, 'title' | 'outcome' | 'offers' | 'needs' | 'topics' | 'mode' | 'horizon'> & { id: string }
}

export type ServerMatch = {
  id: string
  leftIntentId: string
  rightIntentId: string
  score: number
  status: MatchStatus
  youReceive: string[]
  theyReceive: string[]
  reasons: string[]
  limitations: string[]
  counterpart: MatchCounterpart
  intro: { id: string; status: string; direction: 'incoming' | 'outgoing' } | null
  /** The viewer's own usefulness rating, if given. */
  myFeedback: boolean | null
}

export type MatchPage = { items: ServerMatch[]; page: { nextCursor: string | null } }
export type ListMatchesQuery = { actorId: string; intentId: string; cursor?: string; limit: number }

export interface MatchingGateway {
  /** Recomputes matches for an owned active intent; clears unengaged matches otherwise. Returns false when the actor does not own it. */
  refresh(actorId: string, intentId: string): Promise<boolean>
  list(query: ListMatchesQuery): Promise<MatchPage | null>
  /** Records the viewer's rating; false when the match is not visible to them. */
  rate(actorId: string, matchId: string, useful: boolean): Promise<boolean>
}

export class ManageMatches {
  constructor(private readonly gateway: MatchingGateway) {}

  refresh(actorId: string, intentId: string) { return this.gateway.refresh(actorId, intentId) }

  async list(query: ListMatchesQuery): Promise<MatchPage> {
    const page = await this.gateway.list(query)
    if (!page) throw new ApplicationError('not_found', 'Intent was not found')
    return page
  }

  async rate(actorId: string, matchId: string, useful: boolean): Promise<{ matchId: string; useful: boolean }> {
    if (!await this.gateway.rate(actorId, matchId, useful)) throw new ApplicationError('not_found', 'Match was not found')
    return { matchId, useful }
  }
}
