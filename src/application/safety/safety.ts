import { ApplicationError } from '../intros/intro-request'

export type ReportSubject = 'user' | 'intent' | 'intro_request'
export type BlockCommand = { actorId: string; blockedUserId: string; reason?: string }
export type ReportCommand = { actorId: string; subjectType: ReportSubject; subjectId: string; reasonCode: string; details: string }
export type ReportReceipt = { id: string; status: 'open' }

export const reportsPerDay = 20

export interface SafetyGateway {
  /** Records the block and closes pending intros between the pair. Returns false when the user does not exist. */
  block(command: BlockCommand): Promise<boolean>
  report(command: ReportCommand, dailyLimit: number): Promise<ReportReceipt | null>
}

export class ManageSafety {
  constructor(private readonly gateway: SafetyGateway) {}

  async block(command: BlockCommand): Promise<void> {
    if (command.actorId === command.blockedUserId) throw new ApplicationError('conflict', 'You cannot block yourself')
    if (!await this.gateway.block(command)) throw new ApplicationError('not_found', 'User was not found')
  }

  async report(command: ReportCommand): Promise<ReportReceipt> {
    const receipt = await this.gateway.report(command, reportsPerDay)
    if (!receipt) throw new ApplicationError('rate_limited', `At most ${reportsPerDay} reports can be filed per day`)
    return receipt
  }
}
