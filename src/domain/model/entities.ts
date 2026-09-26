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
  /** Server-backed matches only: the match resource, its limitations, and any intro already on it. */
  matchId?: string
  limitations?: string[]
  introId?: string
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

export type Milestone = {
  id: string
  title: string
  status: 'pending' | 'completed'
  completedAt?: string
}

export type Collaboration = {
  id: string
  introRequestId: string
  personId: string
  title: string
  status: 'active' | 'outcome-ready' | 'verification-pending' | 'verified'
  startedAt: string
  milestones: Milestone[]
}

export type OutcomeVerification = {
  id: string
  collaborationId: string
  personId: string
  evidence: string
  status: 'pending' | 'confirmed' | 'disputed'
  requestedAt: string
  resolvedAt?: string
  /** True when the current viewer is the counterparty who must confirm or dispute. */
  awaitingMyDecision?: boolean
}

export type TrustSignal = {
  id: string
  collaborationId: string
  verificationId: string
  personId: string
  label: string
  issuedAt: string
}