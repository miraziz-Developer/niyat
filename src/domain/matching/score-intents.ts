export type MatchableIntent = {
  offers: string[]
  needs: string[]
  topics: string[]
  mode: 'online' | 'offline' | 'hybrid'
}

/** Symmetric evidence for a pair; each side reads it from its own perspective. */
export type PairEvidence = {
  leftReceives: string[]
  rightReceives: string[]
  sharedTopics: string[]
  modeFit: boolean
}

export type ScoredPair = PairEvidence & { score: number }

export type Explanation = {
  youReceive: string[]
  theyReceive: string[]
  reasons: string[]
  limitations: string[]
}

export const matchingModelVersion = 'reciprocal-v1'

const normalize = (value: string) => value.trim().toLocaleLowerCase()

export function overlap(a: string[], b: string[]) {
  const right = new Set(b.map(normalize))
  return a.filter((item) => right.has(normalize(item)))
}

/** Score is match strength, not probability. It is symmetric: score(a, b) === score(b, a). */
export function scoreIntentPair(left: MatchableIntent, right: MatchableIntent): ScoredPair {
  const leftReceives = overlap(left.needs, right.offers)
  const rightReceives = overlap(left.offers, right.needs)
  const sharedTopics = overlap(left.topics, right.topics)
  const modeFit = left.mode === right.mode || left.mode === 'hybrid' || right.mode === 'hybrid'

  const exchangeScore = Math.min(60, (leftReceives.length + rightReceives.length) * 18)
  const contextScore = Math.min(25, sharedTopics.length * 9)
  const logisticsScore = modeFit ? 10 : 2
  const reciprocityBonus = leftReceives.length > 0 && rightReceives.length > 0 ? 5 : 0
  return { leftReceives, rightReceives, sharedTopics, modeFit, score: Math.min(99, exchangeScore + contextScore + logisticsScore + reciprocityBonus) }
}

export function explainPair(evidence: PairEvidence, perspective: 'left' | 'right'): Explanation {
  const youReceive = perspective === 'left' ? evidence.leftReceives : evidence.rightReceives
  const theyReceive = perspective === 'left' ? evidence.rightReceives : evidence.leftReceives
  const reciprocal = youReceive.length > 0 && theyReceive.length > 0
  return {
    youReceive,
    theyReceive,
    reasons: [
      ...evidence.sharedTopics.slice(0, 2).map((topic) => `“${topic}” umumiy kontekst`),
      ...(evidence.modeFit ? ['Ishlash formati mos'] : []),
      ...(reciprocal ? ['Ikki tomonlama qiymat bor'] : []),
    ],
    limitations: [
      ...(youReceive.length === 0 ? ['Sizga bevosita beradigan narsasi hali aniq emas'] : []),
      ...(theyReceive.length === 0 ? ['Siz unga nima bera olishingiz hali aniq emas'] : []),
      ...(evidence.sharedTopics.length === 0 ? ['Umumiy mavzu topilmadi'] : []),
      ...(evidence.modeFit ? [] : ['Ishlash formati farq qiladi']),
    ],
  }
}

export const minimumMatchScore = 40
export const maximumMatchesPerIntent = 20

/**
 * Keeps only pairs where at least one side gains something concrete and the score clears the floor,
 * strongest first, capped so one intent cannot flood the network.
 */
export function selectMatches<T extends MatchableIntent>(source: MatchableIntent, candidates: T[]): Array<{ candidate: T; pair: ScoredPair }> {
  return candidates
    .map((candidate) => ({ candidate, pair: scoreIntentPair(source, candidate) }))
    .filter(({ pair }) => pair.score >= minimumMatchScore && pair.leftReceives.length + pair.rightReceives.length > 0)
    .sort((a, b) => b.pair.score - a.pair.score)
    .slice(0, maximumMatchesPerIntent)
}
