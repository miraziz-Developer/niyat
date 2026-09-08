import { calculateMatch } from '../../domain/matching/calculate-match'
import type { Intent, Person } from '../../domain/model/entities'

/** Returns a new list ordered by reciprocal value. Input candidates are never mutated. */
export function rankMatches(intent: Intent, candidates: Person[]) {
  return candidates
    .map((person) => calculateMatch(intent, person))
    .sort((left, right) => right.score - left.score)
}