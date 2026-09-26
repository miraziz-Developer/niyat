import type { Circle, Intent, IntroRequest, Person } from '../domain/model/entities'

export type IntentDraft = Pick<Intent, 'title' | 'outcome' | 'offers' | 'needs' | 'topics'>

export type AppData = {
  starterIntent: IntentDraft
  people: Person[]
  circles: Circle[]
  initialRequests: IntroRequest[]
}
export type Viewer = {
  name: string
  subtitle: string
  verified: boolean
}
