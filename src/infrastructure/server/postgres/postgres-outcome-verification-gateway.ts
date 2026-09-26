import { ApplicationError } from '../../../application/intros/intro-request'
import { assertCounterpartyResolver, assertParticipant, type CollaborationDetail, type OutcomeVerificationGateway, type ServerCollaboration, type ServerMilestone, type ServerOutcomeVerification, type ServerTrustSignal, type VerificationResult } from '../../../application/outcomes/server-outcome-verification'
import type { SqlDatabase, SqlExecutor } from '../ports'
import { withActor, toIso, isUniqueViolation, required } from './actor-transaction'

type CollaborationRow = Record<string, unknown> & { id: string; intro_request_id: string; creator_id: string; counterparty_id: string; title: string; status: ServerCollaboration['status']; created_at: Date | string }
type MilestoneRow = Record<string, unknown> & { id: string; collaboration_id: string; title: string; position: number; status: ServerMilestone['status']; completed_at: Date | string | null }
type VerificationRow = Record<string, unknown> & { id: string; collaboration_id: string; requester_id: string; evidence: string; status: ServerOutcomeVerification['status']; requested_at: Date | string; resolved_at: Date | string | null; resolved_by: string | null }
type TrustRow = Record<string, unknown> & { id: string; collaboration_id: string; verification_id: string; subject_id: string; attester_id: string; label: string; issued_at: Date | string }
type IntroRow = Record<string, unknown> & { id: string; sender_id: string; receiver_id: string; status: string }

export class PostgresOutcomeVerificationGateway implements OutcomeVerificationGateway {
  constructor(private readonly database: SqlDatabase) {}

  createCollaboration(command: { actorId: string; introRequestId: string; title: string; milestones: string[] }): Promise<CollaborationDetail> {
    return withActor(this.database, command.actorId, async transaction => {
      const found = await transaction.query<IntroRow>('SELECT id, sender_id, receiver_id, status FROM intro_requests WHERE id = $1 FOR UPDATE', [command.introRequestId])
      const intro = found.rows[0]
      if (!intro) throw new ApplicationError('not_found', 'Intro request was not found')
      if (intro.status !== 'accepted') throw new ApplicationError('conflict', 'Only accepted intro requests can become collaborations')
      if (command.actorId !== intro.sender_id && command.actorId !== intro.receiver_id) throw new ApplicationError('forbidden', 'Only intro participants may start a collaboration')
      const counterpartyId = command.actorId === intro.sender_id ? intro.receiver_id : intro.sender_id
      try {
        const inserted = await transaction.query<CollaborationRow>(`
          INSERT INTO collaborations (intro_request_id, creator_id, counterparty_id, title)
          VALUES ($1, $2, $3, $4)
          RETURNING id, intro_request_id, creator_id, counterparty_id, title, status, created_at`,
        [intro.id, command.actorId, counterpartyId, command.title])
        const collaboration = mapCollaboration(required(inserted.rows[0], 'collaboration'))
        const milestones: ServerMilestone[] = []
        for (const [index, title] of command.milestones.entries()) {
          const result = await transaction.query<MilestoneRow>(`
            INSERT INTO collaboration_milestones (collaboration_id, title, position)
            VALUES ($1, $2, $3)
            RETURNING id, collaboration_id, title, position, status, completed_at`,
          [collaboration.id, title, index + 1])
          milestones.push(mapMilestone(required(result.rows[0], 'milestone')))
        }
        return { ...collaboration, milestones }
      } catch (error) {
        if (isUniqueViolation(error)) throw new ApplicationError('conflict', 'A collaboration already exists for this intro request')
        throw error
      }
    })
  }

  completeMilestone(command: { actorId: string; collaborationId: string; milestoneId: string }): Promise<CollaborationDetail> {
    return withActor(this.database, command.actorId, async transaction => {
      const collaboration = await this.lockCollaboration(transaction, command.collaborationId)
      assertParticipant(collaboration, command.actorId)
      if (collaboration.status !== 'active') throw new ApplicationError('conflict', 'Only active collaborations can update milestones')
      const updated = await transaction.query<MilestoneRow>(`
        UPDATE collaboration_milestones SET status = 'completed', completed_by = $3, completed_at = now()
        WHERE id = $1 AND collaboration_id = $2 AND status = 'pending'
        RETURNING id, collaboration_id, title, position, status, completed_at`,
      [command.milestoneId, command.collaborationId, command.actorId])
      if (!updated.rows[0]) throw new ApplicationError('not_found', 'Pending milestone was not found')
      const remaining = await transaction.query<Record<string, unknown> & { count: number }>(
        `SELECT count(*)::int AS count FROM collaboration_milestones WHERE collaboration_id = $1 AND status = 'pending'`, [command.collaborationId])
      let current = collaboration
      if (remaining.rows[0]?.count === 0) {
        const result = await transaction.query<CollaborationRow>(`
          UPDATE collaborations SET status = 'outcome-ready' WHERE id = $1
          RETURNING id, intro_request_id, creator_id, counterparty_id, title, status, created_at`, [command.collaborationId])
        current = mapCollaboration(required(result.rows[0], 'collaboration'))
      }
      return { ...current, milestones: await this.listMilestones(transaction, command.collaborationId) }
    })
  }

  requestVerification(command: { actorId: string; collaborationId: string; evidence: string }): Promise<VerificationResult> {
    return withActor(this.database, command.actorId, async transaction => {
      const collaboration = await this.lockCollaboration(transaction, command.collaborationId)
      assertParticipant(collaboration, command.actorId)
      if (collaboration.status !== 'outcome-ready') throw new ApplicationError('conflict', 'Collaboration is not ready for outcome verification')
      const inserted = await transaction.query<VerificationRow>(`
        INSERT INTO outcome_verifications (collaboration_id, requester_id, evidence)
        VALUES ($1, $2, $3)
        RETURNING id, collaboration_id, requester_id, evidence, status, requested_at, resolved_at, resolved_by`,
      [command.collaborationId, command.actorId, command.evidence])
      const updated = await transaction.query<CollaborationRow>(`
        UPDATE collaborations SET status = 'verification-pending' WHERE id = $1
        RETURNING id, intro_request_id, creator_id, counterparty_id, title, status, created_at`, [command.collaborationId])
      return { collaboration: mapCollaboration(required(updated.rows[0], 'collaboration')), verification: mapVerification(required(inserted.rows[0], 'verification')) }
    })
  }

  resolveVerification(command: { actorId: string; verificationId: string; decision: 'confirmed' | 'disputed' }): Promise<VerificationResult> {
    return withActor(this.database, command.actorId, async transaction => {
      const found = await transaction.query<VerificationRow>(`
        SELECT id, collaboration_id, requester_id, evidence, status, requested_at, resolved_at, resolved_by
        FROM outcome_verifications WHERE id = $1 FOR UPDATE`, [command.verificationId])
      const verificationRow = found.rows[0]
      if (!verificationRow) throw new ApplicationError('not_found', 'Outcome verification was not found')
      if (verificationRow.status !== 'pending') throw new ApplicationError('conflict', 'Only pending outcome verification can be resolved')
      const collaboration = await this.lockCollaboration(transaction, verificationRow.collaboration_id)
      assertCounterpartyResolver(collaboration, mapVerification(verificationRow), command.actorId)
      const resolved = await transaction.query<VerificationRow>(`
        UPDATE outcome_verifications SET status = $2 WHERE id = $1
        RETURNING id, collaboration_id, requester_id, evidence, status, requested_at, resolved_at, resolved_by`,
      [command.verificationId, command.decision])
      const updated = await transaction.query<CollaborationRow>(`
        UPDATE collaborations SET status = $2 WHERE id = $1
        RETURNING id, intro_request_id, creator_id, counterparty_id, title, status, created_at`,
      [collaboration.id, command.decision === 'confirmed' ? 'verified' : 'outcome-ready'])
      const result: VerificationResult = { collaboration: mapCollaboration(required(updated.rows[0], 'collaboration')), verification: mapVerification(required(resolved.rows[0], 'verification')) }
      if (command.decision === 'confirmed') {
        const signal = await transaction.query<TrustRow>(`
          INSERT INTO trust_signals (collaboration_id, verification_id, subject_id, attester_id, label)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING id, collaboration_id, verification_id, subject_id, attester_id, label, issued_at`,
        [collaboration.id, command.verificationId, verificationRow.requester_id, command.actorId, collaboration.title])
        result.trustSignal = mapTrust(required(signal.rows[0], 'trust signal'))
      }
      return result
    })
  }

  listTrustSignals(actorId: string): Promise<ServerTrustSignal[]> {
    return withActor(this.database, actorId, async transaction => {
      const result = await transaction.query<TrustRow>(`
        SELECT id, collaboration_id, verification_id, subject_id, attester_id, label, issued_at
        FROM trust_signals WHERE subject_id = $1 ORDER BY issued_at DESC`, [actorId])
      return result.rows.map(mapTrust)
    })
  }

  listCollaborations(actorId: string): Promise<Array<CollaborationDetail & { verification?: ServerOutcomeVerification }>> {
    return withActor(this.database, actorId, async transaction => {
      const result = await transaction.query<CollaborationRow>(`
        SELECT id, intro_request_id, creator_id, counterparty_id, title, status, created_at
        FROM collaborations WHERE creator_id = $1 OR counterparty_id = $1 ORDER BY created_at DESC`, [actorId])
      const items: Array<CollaborationDetail & { verification?: ServerOutcomeVerification }> = []
      for (const row of result.rows) {
        const collaboration = mapCollaboration(row)
        const verification = await transaction.query<VerificationRow>(`
          SELECT id, collaboration_id, requester_id, evidence, status, requested_at, resolved_at, resolved_by
          FROM outcome_verifications WHERE collaboration_id = $1 ORDER BY requested_at DESC LIMIT 1`, [row.id])
        items.push({ ...collaboration, milestones: await this.listMilestones(transaction, row.id), ...(verification.rows[0] ? { verification: mapVerification(verification.rows[0]) } : {}) })
      }
      return items
    })
  }

  private async lockCollaboration(transaction: SqlExecutor, id: string): Promise<ServerCollaboration> {
    const result = await transaction.query<CollaborationRow>(`
      SELECT id, intro_request_id, creator_id, counterparty_id, title, status, created_at
      FROM collaborations WHERE id = $1 FOR UPDATE`, [id])
    if (!result.rows[0]) throw new ApplicationError('not_found', 'Collaboration was not found')
    return mapCollaboration(result.rows[0])
  }

  private async listMilestones(transaction: SqlExecutor, collaborationId: string): Promise<ServerMilestone[]> {
    const result = await transaction.query<MilestoneRow>(`
      SELECT id, collaboration_id, title, position, status, completed_at
      FROM collaboration_milestones WHERE collaboration_id = $1 ORDER BY position`, [collaborationId])
    return result.rows.map(mapMilestone)
  }
}

function mapCollaboration(row: CollaborationRow): ServerCollaboration { return { id: row.id, introRequestId: row.intro_request_id, creatorId: row.creator_id, counterpartyId: row.counterparty_id, title: row.title, status: row.status, createdAt: toIso(row.created_at) } }
function mapMilestone(row: MilestoneRow): ServerMilestone { return { id: row.id, collaborationId: row.collaboration_id, title: row.title, position: row.position, status: row.status, ...(row.completed_at ? { completedAt: toIso(row.completed_at) } : {}) } }
function mapVerification(row: VerificationRow): ServerOutcomeVerification { return { id: row.id, collaborationId: row.collaboration_id, requesterId: row.requester_id, evidence: row.evidence, status: row.status, requestedAt: toIso(row.requested_at), ...(row.resolved_at ? { resolvedAt: toIso(row.resolved_at) } : {}), ...(row.resolved_by ? { resolvedBy: row.resolved_by } : {}) } }
function mapTrust(row: TrustRow): ServerTrustSignal { return { id: row.id, collaborationId: row.collaboration_id, verificationId: row.verification_id, subjectId: row.subject_id, attesterId: row.attester_id, label: row.label, issuedAt: toIso(row.issued_at) } }
