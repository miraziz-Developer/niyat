import type { DecisionInput, ModerationGateway, ModerationReport, ReportStatus } from '../../../application/moderation/moderation'
import type { SqlDatabase, SqlExecutor } from '../ports'
import { toIso, withActor } from './actor-transaction'

type ReportRow = Record<string, unknown> & {
  id: string
  subject_type: ModerationReport['subjectType']
  subject_id: string
  reason_code: string
  details: string
  status: ReportStatus
  created_at: Date | string
  label: string | null
  subject_user_id: string | null
  subject_user_status: string | null
  decisions: Array<{ status: ReportStatus; note: string; suspended_user_id: string | null; decided_at: string }> | null
}

// Reports and decisions are readable here only because RLS admits moderators (is_moderator()).
const reportSelect = `
  SELECT reports.id, reports.subject_type, reports.subject_id, reports.reason_code, reports.details, reports.status, reports.created_at,
         subject.label, subject.subject_user_id, subject_user.status::text AS subject_user_status,
         (SELECT json_agg(json_build_object('status', d.status, 'note', d.note, 'suspended_user_id', d.suspended_user_id, 'decided_at', d.decided_at) ORDER BY d.decided_at DESC)
            FROM report_decisions AS d WHERE d.report_id = reports.id) AS decisions
  FROM reports
  LEFT JOIN LATERAL moderation_subject(reports.subject_type, reports.subject_id, reports.reporter_id) AS subject ON true
  LEFT JOIN users AS subject_user ON subject_user.id = subject.subject_user_id`

export class PostgresModerationGateway implements ModerationGateway {
  constructor(private readonly database: SqlDatabase) {}

  isModerator(actorId: string): Promise<boolean> {
    return withActor(this.database, actorId, transaction => this.check(transaction))
  }

  list(actorId: string, statuses: ReportStatus[]): Promise<ModerationReport[] | null> {
    return withActor(this.database, actorId, async transaction => {
      if (!await this.check(transaction)) return null
      const result = await transaction.query<ReportRow>(`${reportSelect} WHERE reports.status = ANY($1::report_status[]) ORDER BY reports.created_at LIMIT 200`, [statuses])
      return result.rows.map(mapReport)
    })
  }

  decide(actorId: string, reportId: string, input: DecisionInput): Promise<ModerationReport | null | 'not_found'> {
    return withActor(this.database, actorId, async transaction => {
      if (!await this.check(transaction)) return null
      const found = await transaction.query<ReportRow>(`${reportSelect} WHERE reports.id = $1`, [reportId])
      const report = found.rows[0]
      if (!report) return 'not_found'
      await transaction.query(`SELECT id FROM reports WHERE id = $1 FOR UPDATE`, [reportId])
      const suspendUserId = input.suspend && report.subject_user_id && report.subject_user_id !== actorId ? report.subject_user_id : null
      await transaction.query(`
        UPDATE reports SET status = $2::report_status, assigned_moderator_id = $3,
          resolved_at = CASE WHEN $2::text IN ('resolved', 'dismissed') THEN now() ELSE NULL END
        WHERE id = $1`, [reportId, input.status, actorId])
      await transaction.query(`
        INSERT INTO report_decisions (report_id, moderator_id, status, note, suspended_user_id) VALUES ($1, $2, $3::report_status, $4, $5)`,
      [reportId, actorId, input.status, input.note, suspendUserId])
      if (suspendUserId) {
        await transaction.query(`UPDATE users SET status = 'suspended', updated_at = now() WHERE id = $1 AND status = 'active'`, [suspendUserId])
        await transaction.query(`UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [suspendUserId])
      }
      // The audit trail records who decided what, never the free-text note.
      await transaction.query(`
        INSERT INTO audit_events (actor_id, action, resource_type, resource_id, metadata)
        VALUES ($1, 'report.decided', 'report', $2, jsonb_build_object('status', $3::text, 'suspended', $4::boolean))`,
      [actorId, reportId, input.status, Boolean(suspendUserId)])
      const updated = await transaction.query<ReportRow>(`${reportSelect} WHERE reports.id = $1`, [reportId])
      return mapReport(updated.rows[0]!)
    })
  }

  private async check(transaction: SqlExecutor): Promise<boolean> {
    const result = await transaction.query<{ moderator: boolean }>(`SELECT is_moderator() AS moderator`)
    return Boolean(result.rows[0]?.moderator)
  }
}

function mapReport(row: ReportRow): ModerationReport {
  return {
    id: row.id,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    subjectLabel: row.label,
    subjectUserId: row.subject_user_id,
    subjectUserStatus: row.subject_user_status,
    reasonCode: row.reason_code,
    details: row.details,
    status: row.status,
    createdAt: toIso(row.created_at),
    decisions: (row.decisions ?? []).map(decision => ({ status: decision.status, note: decision.note, suspendedUserId: decision.suspended_user_id, decidedAt: toIso(decision.decided_at) })),
  }
}
