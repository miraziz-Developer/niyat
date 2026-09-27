import type { SqlExecutor } from '../ports'

export type AnalyticsEvent = 'signed_in' | 'intent_published' | 'matches_viewed' | 'match_rated' | 'intro_requested' | 'intro_accepted' | 'collaboration_started' | 'outcome_verified'

/**
 * Records a product event in the caller's transaction so metrics never count work that rolled back.
 * Properties are small, fixed-shape values; free text never goes here.
 */
export async function recordEvent(transaction: SqlExecutor, userId: string, name: AnalyticsEvent, properties: Record<string, string | number | boolean> = {}): Promise<void> {
  await transaction.query(`INSERT INTO analytics_events (user_id, name, properties) VALUES ($1, $2, $3::jsonb)`, [userId, name, JSON.stringify(properties)])
}
