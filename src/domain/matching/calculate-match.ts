import type { Intent, Match, Person } from '../model/entities'
import { explainPair, scoreIntentPair } from './score-intents'

export { overlap } from './score-intents'

export function calculateMatch(intent: Intent, person: Person): Match {
  const pair = scoreIntentPair(intent, person.intent)
  const explanation = explainPair(pair, 'left')
  return {
    person,
    score: pair.score,
    reasons: explanation.reasons,
    youReceive: explanation.youReceive,
    theyReceive: explanation.theyReceive,
    opening: `Salom, ${person.name.split(' ')[0]}. “${intent.title}” ustida ishlayapman. Sizning “${person.intent.title}” niyatingiz bilan o‘zaro foydali nuqta ko‘rdim. 15 daqiqa fikr almashamizmi?`,
  }
}
