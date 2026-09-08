import type { Intent, Match, Person } from '../model/entities'

const normalize = (value: string) => value.trim().toLocaleLowerCase()

export function overlap(a: string[], b: string[]) {
  const right = new Set(b.map(normalize))
  return a.filter((item) => right.has(normalize(item)))
}

export function calculateMatch(intent: Intent, person: Person): Match {
  const theyCanGive = overlap(intent.needs, person.intent.offers)
  const youCanGive = overlap(intent.offers, person.intent.needs)
  const sharedTopics = overlap(intent.topics, person.intent.topics)
  const modeFit = intent.mode === person.intent.mode || intent.mode === 'hybrid' || person.intent.mode === 'hybrid'

  const exchangeScore = Math.min(60, (theyCanGive.length + youCanGive.length) * 18)
  const contextScore = Math.min(25, sharedTopics.length * 9)
  const logisticsScore = modeFit ? 10 : 2
  const reciprocityBonus = theyCanGive.length > 0 && youCanGive.length > 0 ? 5 : 0
  const score = Math.min(99, exchangeScore + contextScore + logisticsScore + reciprocityBonus)

  const reasons = [
    ...sharedTopics.slice(0, 2).map((topic) => `“${topic}” umumiy kontekst`),
    ...(modeFit ? ['Ishlash formati mos'] : []),
    ...(reciprocityBonus ? ['Ikki tomonlama qiymat bor'] : []),
  ]

  return {
    person,
    score,
    reasons,
    youReceive: theyCanGive,
    theyReceive: youCanGive,
    opening: `Salom, ${person.name.split(' ')[0]}. “${intent.title}” ustida ishlayapman. Sizning “${person.intent.title}” niyatingiz bilan o‘zaro foydali nuqta ko‘rdim. 15 daqiqa fikr almashamizmi?`,
  }
}
