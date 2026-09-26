import { ApplicationError } from '../intros/intro-request'

export type ServerProfile = {
  userId: string
  displayName: string
  bio: string
  languages: string[]
  verificationLevel: number
}

export type UpdateProfileCommand = {
  actorId: string
  displayName: string
  bio: string
  languages: string[]
}

export interface ProfileGateway {
  find(actorId: string): Promise<ServerProfile | null>
  upsert(command: UpdateProfileCommand): Promise<ServerProfile>
}

export class ManageProfiles {
  constructor(private readonly gateway: ProfileGateway) {}

  async get(actorId: string): Promise<ServerProfile> {
    const profile = await this.gateway.find(actorId)
    if (!profile) throw new ApplicationError('not_found', 'Profile was not created yet')
    return profile
  }

  update(command: UpdateProfileCommand) {
    return this.gateway.upsert({ ...command, languages: [...new Set(command.languages)] })
  }
}
