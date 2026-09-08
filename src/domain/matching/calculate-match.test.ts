import { describe, expect, it } from 'vitest'
import { rankMatches } from '../../application/matching/rank-matches'
import { people } from '../../infrastructure/demo/demo-data'
import type { Intent } from '../model/entities'
import { calculateMatch, overlap } from './calculate-match'

const intent: Intent = {
  id: 'test', title: 'Build', outcome: 'Launch',
  offers: ['technical cofounder', 'storytelling'],
  needs: ['product design', 'distribution'],
  topics: ['ai', 'startups'], location: 'Global', mode: 'hybrid', horizon: 'now', visibility: 'network',
}

describe('intent matching', () => {
  it('matches tags without case sensitivity', () => {
    expect(overlap(['AI', 'Design'], ['ai'])).toEqual(['AI'])
  })

  it('rewards reciprocal value', () => {
    const match = calculateMatch(intent, people[0])
    expect(match.youReceive).toContain('product design')
    expect(match.theyReceive).toContain('technical cofounder')
    expect(match.reasons).toContain('Ikki tomonlama qiymat bor')
  })

  it('ranks the strongest match first', () => {
    const ranked = rankMatches(intent, people)
    expect(ranked[0].score).toBeGreaterThanOrEqual(ranked[1].score)
    expect(ranked).toHaveLength(people.length)
  })
})