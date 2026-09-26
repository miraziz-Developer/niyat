import { describe, expect, it } from 'vitest'
import { explainPair, maximumMatchesPerIntent, scoreIntentPair, selectMatches, type MatchableIntent } from './score-intents'

const builder: MatchableIntent = { offers: ['engineering'], needs: ['design', 'distribution'], topics: ['ai'], mode: 'online' }
const designer: MatchableIntent = { offers: ['Design'], needs: ['engineering'], topics: ['AI'], mode: 'hybrid' }
const stranger: MatchableIntent = { offers: ['cooking'], needs: ['gardening'], topics: ['food'], mode: 'offline' }

describe('reciprocal intent scoring', () => {
  it('is symmetric so a stored pair reads the same from both sides', () => {
    expect(scoreIntentPair(builder, designer).score).toBe(scoreIntentPair(designer, builder).score)
  })

  it('explains value from each viewer perspective with limitations', () => {
    const pair = scoreIntentPair(builder, designer)
    expect(explainPair(pair, 'left')).toMatchObject({ youReceive: ['design'], theyReceive: ['engineering'] })
    expect(explainPair(pair, 'right')).toMatchObject({ youReceive: ['engineering'], theyReceive: ['design'] })
    expect(explainPair(pair, 'left').reasons).toContain('Ikki tomonlama qiymat bor')
    expect(explainPair(scoreIntentPair(builder, stranger), 'left').limitations).toContain('Ishlash formati farq qiladi')
  })

  it('drops pairs without concrete exchange and caps the result', () => {
    expect(selectMatches(builder, [stranger])).toEqual([])
    const many = Array.from({ length: 30 }, () => designer)
    expect(selectMatches(builder, many)).toHaveLength(maximumMatchesPerIntent)
  })
})
