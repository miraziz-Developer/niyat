import { ApplicationError } from '../intros/intro-request'
import type { ReportSubject } from '../safety/safety'

export type ReportStatus = 'open' | 'reviewing' | 'resolved' | 'dismissed'

export type ModerationReport = {
  id: string
  subjectType: ReportSubject
  subjectId: string
  subjectLabel: string | null
  subjectUserId: string | null
  subjectUserStatus: string | null
  reasonCode: string
  details: string
  status: ReportStatus
  createdAt: string
  decisions: Array<{ status: ReportStatus; note: string; suspendedUserId: string | null; decidedAt: string }>
}

export type DecisionInput = { status: Exclude<ReportStatus, 'open'>; note: string; suspend: boolean }

export interface ModerationGateway {
  isModerator(actorId: string): Promise<boolean>
  /** Null when the actor is not a moderator. */
  list(actorId: string, statuses: ReportStatus[]): Promise<ModerationReport[] | null>
  decide(actorId: string, reportId: string, input: DecisionInput): Promise<ModerationReport | null | 'not_found'>
}

export class ManageModeration {
  constructor(private readonly gateway: ModerationGateway) {}

  isModerator(actorId: string) { return this.gateway.isModerator(actorId) }

  async list(actorId: string, statuses: ReportStatus[]): Promise<ModerationReport[]> {
    const reports = await this.gateway.list(actorId, statuses)
    if (!reports) throw forbidden()
    return reports
  }

  async decide(actorId: string, reportId: string, input: DecisionInput): Promise<ModerationReport> {
    if (input.suspend && input.status !== 'resolved') throw new ApplicationError('conflict', 'Suspending a member requires resolving the report')
    const result = await this.gateway.decide(actorId, reportId, input)
    if (result === 'not_found') throw new ApplicationError('not_found', 'Report was not found')
    if (!result) throw forbidden()
    return result
  }
}

function forbidden() {
  return new ApplicationError('forbidden', 'Only moderators can review reports')
}
