import { ApplicationError } from '../intros/intro-request'

export type IntentStatus = 'draft' | 'active' | 'paused' | 'completed' | 'expired'
export type IntentInputStatus = Exclude<IntentStatus, 'expired'>

export type IntentInput = {
  title: string
  outcome: string
  offers: string[]
  needs: string[]
  topics: string[]
  mode: 'online' | 'offline' | 'hybrid'
  horizon: 'now' | 'month' | 'quarter'
  visibility: 'public' | 'matched' | 'private'
  status: IntentInputStatus
}

export type ServerIntent = Omit<IntentInput, 'status'> & {
  id: string
  ownerId: string
  status: IntentStatus
  createdAt: string
  updatedAt: string
}

export type IntentPage = { items: ServerIntent[]; page: { nextCursor: string | null } }

export type CreateIntentCommand = { actorId: string; input: IntentInput }
export type UpdateIntentCommand = { actorId: string; intentId: string; input: IntentInput }
export type IntentCommand = { actorId: string; intentId: string }
export type ListIntentsQuery = { actorId: string; cursor?: string; limit: number }

/** Thrown by a gateway when a list cursor was not issued by it. */
export class InvalidCursorError extends Error {
  constructor() {
    super('cursor is invalid')
    this.name = 'InvalidCursorError'
  }
}

export interface IntentGateway {
  create(command: CreateIntentCommand): Promise<ServerIntent>
  find(command: IntentCommand): Promise<ServerIntent | null>
  update(command: UpdateIntentCommand, assertTransition: (current: ServerIntent) => void): Promise<ServerIntent | null>
  remove(command: IntentCommand): Promise<boolean>
  list(query: ListIntentsQuery): Promise<IntentPage>
}

const allowedTransitions: Record<IntentStatus, readonly IntentInputStatus[]> = {
  draft: ['draft', 'active'],
  active: ['active', 'paused', 'completed'],
  paused: ['paused', 'active', 'completed'],
  completed: [],
  expired: [],
}

export function assertIntentCreationStatus(status: IntentInputStatus): void {
  if (status !== 'draft' && status !== 'active') {
    throw new ApplicationError('conflict', 'A new intent must start as draft or active')
  }
}

export function assertIntentTransition(from: IntentStatus, to: IntentInputStatus): void {
  if (!allowedTransitions[from].includes(to)) {
    throw new ApplicationError('conflict', from === 'completed' || from === 'expired'
      ? `A ${from} intent can no longer be changed`
      : `Intent cannot move from ${from} to ${to}`)
  }
}

export class ManageIntents {
  constructor(private readonly gateway: IntentGateway) {}

  create(command: CreateIntentCommand) {
    assertIntentCreationStatus(command.input.status)
    return this.gateway.create({ ...command, input: normalize(command.input) })
  }

  async get(command: IntentCommand): Promise<ServerIntent> {
    return found(await this.gateway.find(command))
  }

  async update(command: UpdateIntentCommand): Promise<ServerIntent> {
    const input = normalize(command.input)
    return found(await this.gateway.update({ ...command, input }, current => assertIntentTransition(current.status, input.status)))
  }

  async remove(command: IntentCommand): Promise<void> {
    if (!await this.gateway.remove(command)) throw notFound()
  }

  list(query: ListIntentsQuery) { return this.gateway.list(query) }
}

function normalize(input: IntentInput): IntentInput {
  return { ...input, offers: unique(input.offers), needs: unique(input.needs), topics: unique(input.topics) }
}

function unique(values: string[]): string[] {
  return [...new Set(values)]
}

function found(intent: ServerIntent | null): ServerIntent {
  if (!intent) throw notFound()
  return intent
}

function notFound() {
  // Non-owners receive the same answer as a missing row so intent IDs cannot be probed.
  return new ApplicationError('not_found', 'Intent was not found')
}
