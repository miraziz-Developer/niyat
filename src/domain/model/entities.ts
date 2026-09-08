export type Intent = {
  id: string
  title: string
  outcome: string
  offers: string[]
  needs: string[]
  topics: string[]
  location: string
  mode: 'online' | 'offline' | 'hybrid'
  horizon: 'now' | 'month' | 'quarter'
  visibility: 'network' | 'link'
}

export type Person = {
  id: string
  name: string
  role: string
  city: string
  initials: string
  accent: string
  intent: Intent
}

export type Match = {
  person: Person
  score: number
  reasons: string[]
  youReceive: string[]
  theyReceive: string[]
  opening: string
}

export type IntroRequest = {
  id: string
  personId: string
  direction: 'incoming' | 'outgoing'
  scope: string
  status: 'pending' | 'accepted' | 'declined'
  sentAt: string
}

export type Circle = {
  id: string
  title: string
  outcome: string
  members: number
  capacity: number
  day: number
  duration: number
  progress: number
  tags: string[]
}