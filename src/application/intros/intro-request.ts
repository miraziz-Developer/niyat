export type IntroRequestStatus = 'pending' | 'accepted' | 'declined' | 'cancelled' | 'expired'

export type ServerIntroRequest = {
  id: string
  matchId: string
  senderId: string
  receiverId: string
  scope: string
  message: string
  status: IntroRequestStatus
  expiresAt: string
  createdAt: string
}

export type CreateIntroRequestCommand = {
  actorId: string
  matchId: string
  scope: string
  message: string
}

export type TransitionIntroRequestCommand = {
  actorId: string
  requestId: string
  status: Extract<IntroRequestStatus, 'accepted' | 'declined' | 'cancelled'>
}

export interface IntroRequestGateway {
  create(command: CreateIntroRequestCommand): Promise<ServerIntroRequest>
  transition(command: TransitionIntroRequestCommand): Promise<ServerIntroRequest>
  list(actorId: string): Promise<ServerIntroRequest[]>
}

export class ApplicationError extends Error {
  constructor(
    readonly code: 'forbidden' | 'not_found' | 'conflict',
    message: string,
  ) {
    super(message)
    this.name = 'ApplicationError'
  }
}

export function assertIntroTransitionActor(
  request: Pick<ServerIntroRequest, 'senderId' | 'receiverId'>,
  command: Pick<TransitionIntroRequestCommand, 'actorId' | 'status'>,
): void {
  const receiverAction = command.status === 'accepted' || command.status === 'declined'
  if (receiverAction && command.actorId !== request.receiverId) {
    throw new ApplicationError('forbidden', 'Only the receiver may accept or decline')
  }
  if (command.status === 'cancelled' && command.actorId !== request.senderId) {
    throw new ApplicationError('forbidden', 'Only the sender may cancel')
  }
}

export class ManageIntroRequests {
  constructor(private readonly gateway: IntroRequestGateway) {}

  create(command: CreateIntroRequestCommand) {
    return this.gateway.create(command)
  }

  transition(command: TransitionIntroRequestCommand) {
    return this.gateway.transition(command)
  }

  list(actorId: string) { return this.gateway.list(actorId) }
}