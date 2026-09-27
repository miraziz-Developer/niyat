import { InvalidCursorError } from '../../../application/intents/intent'
import type { ListMatchesQuery, MatchingGateway, MatchPage, MatchStatus, ServerMatch } from '../../../application/matching/server-matching'
import { explainPair, matchingModelVersion, selectMatches, type MatchableIntent, type PairEvidence } from '../../../domain/matching/score-intents'
import type { SqlDatabase } from '../ports'
import { withActor } from './actor-transaction'
import { recordEvent } from './analytics'

type SourceRow = Record<string, unknown> & MatchableIntent & { id: string }
type CandidateRow = Record<string, unknown> & MatchableIntent & { id: string }
type MatchRow = Record<string, unknown> & {
  id: string
  left_intent_id: string
  right_intent_id: string
  score: string | number
  score_cursor: string
  explanation: Partial<PairEvidence>
  status: MatchStatus
  viewer_intent_id: string
  intent_id: string
  owner_id: string
  title: string
  outcome: string
  offers: string[]
  needs: string[]
  topics: string[]
  mode: MatchableIntent['mode']
  horizon: 'now' | 'month' | 'quarter'
  display_name: string | null
  verification_level: number
  intro_id: string | null
  intro_status: string | null
  intro_sender_id: string | null
  my_feedback: boolean | null
}

export class PostgresMatchingGateway implements MatchingGateway {
  constructor(private readonly database: SqlDatabase) {}

  refresh(actorId: string, intentId: string): Promise<boolean> {
    return withActor(this.database, actorId, async transaction => {
      const source = await transaction.query<SourceRow>(
        `SELECT id, offers, needs, topics, mode FROM intents WHERE id = $1 AND owner_id = $2 FOR UPDATE`, [intentId, actorId])
      if (!source.rows[0]) return false
      const sourceId = source.rows[0].id
      // matchable_intents returns nothing for paused, completed or private sources, which clears their open matches below.
      const candidates = await transaction.query<CandidateRow>(`SELECT id, offers, needs, topics, mode FROM matchable_intents($1)`, [intentId])
      const selected = selectMatches(source.rows[0], candidates.rows).map(({ candidate, pair }) => {
        // Both IDs come from PostgreSQL in canonical lowercase form, so string order equals uuid order.
        const sourceIsLeft = sourceId < candidate.id
        const evidence: PairEvidence = {
          leftReceives: sourceIsLeft ? pair.leftReceives : pair.rightReceives,
          rightReceives: sourceIsLeft ? pair.rightReceives : pair.leftReceives,
          sharedTopics: pair.sharedTopics,
          modeFit: pair.modeFit,
        }
        return { left: sourceIsLeft ? sourceId : candidate.id, right: sourceIsLeft ? candidate.id : sourceId, score: pair.score, evidence: JSON.stringify(evidence) }
      })
      const lefts = selected.map(item => item.left)
      const rights = selected.map(item => item.right)

      // Engaged matches (intro requested, connected, dismissed) keep their recorded evidence and status.
      await transaction.query(`
        INSERT INTO matches (left_intent_id, right_intent_id, score, explanation, model_version)
        SELECT pair.left_id, pair.right_id, pair.score, pair.explanation::jsonb, $5
        FROM unnest($1::uuid[], $2::uuid[], $3::numeric[], $4::text[]) AS pair(left_id, right_id, score, explanation)
        ON CONFLICT (left_intent_id, right_intent_id) DO UPDATE
        SET score = EXCLUDED.score, explanation = EXCLUDED.explanation, model_version = EXCLUDED.model_version, updated_at = now()
        WHERE matches.status IN ('candidate', 'shown')`,
      [lefts, rights, selected.map(item => item.score), selected.map(item => item.evidence), matchingModelVersion])
      await transaction.query(`
        DELETE FROM matches
        WHERE (left_intent_id = $1 OR right_intent_id = $1)
          AND status IN ('candidate', 'shown')
          AND NOT EXISTS (SELECT 1 FROM intro_requests WHERE intro_requests.match_id = matches.id)
          AND NOT EXISTS (
            SELECT 1 FROM unnest($2::uuid[], $3::uuid[]) AS kept(left_id, right_id)
            WHERE kept.left_id = matches.left_intent_id AND kept.right_id = matches.right_intent_id
          )`, [sourceId, lefts, rights])
      return true
    })
  }

  rate(actorId: string, matchId: string, useful: boolean): Promise<boolean> {
    return rateMatch(this.database, actorId, matchId, useful)
  }

  async list({ actorId, intentId, cursor, limit }: ListMatchesQuery): Promise<MatchPage | null> {
    const after = cursor === undefined ? null : decodeMatchCursor(cursor)
    return withActor(this.database, actorId, async transaction => {
      const owned = await transaction.query(`SELECT 1 FROM intents WHERE id = $1 AND owner_id = $2`, [intentId, actorId])
      if (!owned.rows[0]) return null
      const result = await transaction.query<MatchRow>(`
        SELECT matches.id, matches.left_intent_id, matches.right_intent_id, matches.score, matches.score::text AS score_cursor,
               matches.explanation, matches.status, counterpart.*,
               intro.id AS intro_id, intro.status::text AS intro_status, intro.sender_id AS intro_sender_id,
               (SELECT useful FROM match_feedback WHERE match_feedback.match_id = matches.id AND match_feedback.user_id = $5) AS my_feedback
        FROM matches
        CROSS JOIN LATERAL match_counterpart(matches.id) AS counterpart
        LEFT JOIN LATERAL (
          SELECT id, status, sender_id FROM intro_requests
          WHERE intro_requests.match_id = matches.id ORDER BY created_at DESC LIMIT 1
        ) AS intro ON true
        WHERE (matches.left_intent_id = $1 OR matches.right_intent_id = $1)
          AND matches.status <> 'dismissed'
          AND (counterpart.intent_status = 'active' OR intro.id IS NOT NULL)
          AND ($2::numeric IS NULL OR (matches.score, matches.id) < ($2::numeric, $3::uuid))
        ORDER BY matches.score DESC, matches.id DESC
        LIMIT $4`,
      [intentId, after?.score ?? null, after?.id ?? null, limit + 1, actorId])
      const rows = result.rows.slice(0, limit)
      const unseen = rows.filter(row => row.status === 'candidate').map(row => row.id)
      if (!after) await recordEvent(transaction, actorId, 'matches_viewed', { count: rows.length })
      if (unseen.length) await transaction.query(`UPDATE matches SET status = 'shown', updated_at = now() WHERE id = ANY($1::uuid[]) AND status = 'candidate'`, [unseen])
      const last = rows.at(-1)
      return {
        items: rows.map(row => mapMatch(row, actorId)),
        page: { nextCursor: result.rows.length > limit && last ? encodeMatchCursor(last.score_cursor, last.id) : null },
      }
    })
  }
}

export async function rateMatch(database: SqlDatabase, actorId: string, matchId: string, useful: boolean): Promise<boolean> {
  return withActor(database, actorId, async transaction => {
    // matches RLS admits only participants, so an invisible match reads as missing.
    const visible = await transaction.query(`SELECT 1 FROM matches WHERE id = $1`, [matchId])
    if (!visible.rows[0]) return false
    await transaction.query(`
      INSERT INTO match_feedback (match_id, user_id, useful) VALUES ($1, $2, $3)
      ON CONFLICT (match_id, user_id) DO UPDATE SET useful = EXCLUDED.useful, updated_at = now()`, [matchId, actorId, useful])
    await recordEvent(transaction, actorId, 'match_rated', { useful })
    return true
  })
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function encodeMatchCursor(score: string, id: string): string {
  return Buffer.from(`${score}|${id}`, 'utf8').toString('base64url')
}

export function decodeMatchCursor(cursor: string): { score: string; id: string } {
  const [score, id, ...rest] = Buffer.from(cursor, 'base64url').toString('utf8').split('|')
  if (rest.length || !/^\d{1,3}(\.\d{1,2})?$/.test(score ?? '') || !uuid.test(id ?? '')) throw new InvalidCursorError()
  return { score, id }
}

function mapMatch(row: MatchRow, actorId: string): ServerMatch {
  const evidence: PairEvidence = {
    leftReceives: row.explanation.leftReceives ?? [],
    rightReceives: row.explanation.rightReceives ?? [],
    sharedTopics: row.explanation.sharedTopics ?? [],
    modeFit: row.explanation.modeFit ?? false,
  }
  const explanation = explainPair(evidence, row.viewer_intent_id === row.left_intent_id ? 'left' : 'right')
  return {
    id: row.id,
    leftIntentId: row.left_intent_id,
    rightIntentId: row.right_intent_id,
    score: Number(row.score),
    status: row.status === 'candidate' ? 'shown' : row.status,
    ...explanation,
    counterpart: {
      userId: row.owner_id,
      displayName: row.display_name,
      verificationLevel: Number(row.verification_level),
      intent: { id: row.intent_id, title: row.title, outcome: row.outcome, offers: row.offers, needs: row.needs, topics: row.topics, mode: row.mode, horizon: row.horizon },
    },
    myFeedback: row.my_feedback ?? null,
    intro: row.intro_id && row.intro_status
      ? { id: row.intro_id, status: row.intro_status, direction: row.intro_sender_id === actorId ? 'outgoing' : 'incoming' }
      : null,
  }
}
