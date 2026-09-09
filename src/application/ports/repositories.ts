import type { Intent, IntroRequest, Match } from '../../domain/model/entities'

export type Page<T> = { items: T[]; nextCursor: string | null }
export type PageQuery = { cursor?: string; limit?: number }

export interface IntentRepository {
  findById(id: string, actorId: string): Promise<Intent | null>
  listOwned(actorId: string, page?: PageQuery): Promise<Page<Intent>>
  save(intent: Intent, actorId: string): Promise<Intent>
  remove(id: string, actorId: string): Promise<void>
}

export interface MatchRepository {
  listForIntent(intentId: string, actorId: string, page?: PageQuery): Promise<Page<Match>>
}

export interface IntroRequestRepository {
  findById(id: string, actorId: string): Promise<IntroRequest | null>
  listForActor(actorId: string, page?: PageQuery): Promise<Page<IntroRequest>>
  save(request: IntroRequest, actorId: string): Promise<IntroRequest>
}

export interface SafetyService {
  block(actorId: string, blockedUserId: string, reason?: string): Promise<void>
  report(actorId: string, subjectType: 'user' | 'intent' | 'intro_request', subjectId: string, reason: string): Promise<string>
  canInteract(actorId: string, targetUserId: string): Promise<boolean>
}