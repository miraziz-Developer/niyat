import type { BlockCommand, ReportCommand, ReportReceipt, SafetyGateway } from '../../../application/safety/safety'
import type { SqlDatabase } from '../ports'
import { withActor } from './actor-transaction'

export class PostgresSafetyGateway implements SafetyGateway {
  constructor(private readonly database: SqlDatabase) {}

  block({ actorId, blockedUserId, reason }: BlockCommand): Promise<boolean> {
    return withActor(this.database, actorId, async transaction => {
      const exists = await transaction.query(`SELECT 1 FROM users WHERE id = $1 AND status <> 'deleted'`, [blockedUserId])
      if (!exists.rows[0]) return false
      await transaction.query(`
        INSERT INTO blocks (blocker_id, blocked_id, reason) VALUES ($1, $2, $3)
        ON CONFLICT (blocker_id, blocked_id) DO NOTHING`, [actorId, blockedUserId, reason ?? null])
      // The block takes effect immediately: pending intros in either direction close with the role-legal status.
      await transaction.query(`
        UPDATE intro_requests SET status = CASE WHEN sender_id = $1 THEN 'cancelled'::intro_status ELSE 'declined'::intro_status END
        WHERE status = 'pending'
          AND ((sender_id = $1 AND receiver_id = $2) OR (sender_id = $2 AND receiver_id = $1))`, [actorId, blockedUserId])
      return true
    })
  }

  report(command: ReportCommand, dailyLimit: number): Promise<ReportReceipt | null> {
    return withActor(this.database, command.actorId, async transaction => {
      // Serialises one reporter's submissions so the daily limit cannot be raced.
      await transaction.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 1))`, [`report:${command.actorId}`])
      const recent = await transaction.query<{ count: number }>(`
        SELECT count(*)::int AS count FROM reports WHERE reporter_id = $1 AND created_at > now() - interval '24 hours'`, [command.actorId])
      if ((recent.rows[0]?.count ?? 0) >= dailyLimit) return null
      const inserted = await transaction.query<{ id: string }>(`
        INSERT INTO reports (reporter_id, subject_type, subject_id, reason_code, details)
        VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [command.actorId, command.subjectType, command.subjectId, command.reasonCode, command.details])
      await transaction.query(`
        INSERT INTO audit_events (actor_id, action, resource_type, resource_id, metadata)
        VALUES ($1, 'report.created', 'report', $2, jsonb_build_object('subject_type', $3::text, 'reason_code', $4::text))`,
      [command.actorId, inserted.rows[0]!.id, command.subjectType, command.reasonCode])
      return { id: inserted.rows[0]!.id, status: 'open' }
    })
  }
}
