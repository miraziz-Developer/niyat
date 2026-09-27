import pg from 'pg'

/*
 * Gate 2 exit metrics from first-party data. Run with the owner DATABASE_URL:
 *   npm run metrics            (all time)
 *   npm run metrics -- 30      (members who joined in the last 30 days)
 */
const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL is required')
const days = Number(process.argv[2] ?? 36500)
if (!Number.isInteger(days) || days < 1) throw new Error('Pass the window in whole days')
const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 })

type Row = Record<string, number | null>

try {
  const { rows: [m] } = await pool.query<Row>(`
    WITH cohort AS (
      SELECT users.id FROM users
      JOIN auth_identities ON auth_identities.user_id = users.id AND auth_identities.provider = 'email'
      WHERE users.created_at > now() - make_interval(days => $1)
    ), consented AS (
      SELECT id FROM users WHERE id IN (SELECT id FROM cohort) AND terms_accepted_at IS NOT NULL
    ), published AS (
      SELECT DISTINCT owner_id FROM intents WHERE owner_id IN (SELECT id FROM cohort) AND published_at IS NOT NULL
    ), requesters AS (
      SELECT DISTINCT sender_id FROM intro_requests WHERE sender_id IN (SELECT id FROM cohort)
    ), first_seen AS (
      SELECT user_id, min(occurred_at) AS at FROM analytics_events WHERE name = 'signed_in' AND user_id IN (SELECT id FROM cohort) GROUP BY user_id
    ), returned AS (
      SELECT DISTINCT events.user_id FROM analytics_events AS events JOIN first_seen USING (user_id)
      WHERE events.occurred_at > first_seen.at + interval '1 day' AND events.occurred_at <= first_seen.at + interval '7 days'
    )
    SELECT
      (SELECT count(*) FROM invitations WHERE revoked_at IS NULL)::int AS invited,
      (SELECT count(*) FROM cohort)::int AS members,
      (SELECT count(*) FROM consented)::int AS consented,
      (SELECT count(*) FROM published)::int AS published,
      (SELECT count(*) FROM requesters)::int AS requesters,
      (SELECT count(*) FROM intro_requests WHERE status = 'accepted' AND sender_id IN (SELECT id FROM cohort))::int AS accepted,
      (SELECT count(*) FROM intro_requests WHERE status IN ('accepted', 'declined', 'expired') AND sender_id IN (SELECT id FROM cohort))::int AS answered,
      (SELECT count(*) FROM match_feedback WHERE useful AND user_id IN (SELECT id FROM cohort))::int AS useful,
      (SELECT count(*) FROM match_feedback WHERE user_id IN (SELECT id FROM cohort))::int AS rated,
      (SELECT count(*) FROM first_seen WHERE at <= now() - interval '7 days')::int AS eligible_for_return,
      (SELECT count(*) FROM returned JOIN first_seen USING (user_id) WHERE first_seen.at <= now() - interval '7 days')::int AS returned,
      (SELECT count(*) FROM trust_signals WHERE subject_id IN (SELECT id FROM cohort))::int AS verified_outcomes,
      (SELECT count(*) FROM reports WHERE status IN ('open', 'reviewing'))::int AS open_reports`, [days])

  const pct = (part: number | null, whole: number | null) => whole ? `${Math.round((part ?? 0) / whole * 100)}%` : '—'
  const target = (value: string, goal: number) => value === '—' ? 'ma’lumot yetarli emas' : Number(value.replace('%', '')) >= goal ? `✓ (maqsad ≥ ${goal}%)` : `✗ (maqsad ≥ ${goal}%)`
  const activation = pct(m.published, m.consented)
  const usefulness = pct(m.useful, m.rated)
  console.log(`NIYAT Gate 2 ko‘rsatkichlari${days < 36500 ? ` · oxirgi ${days} kun` : ''}\n`)
  console.log(`Takliflar (faol)            ${m.invited}`)
  console.log(`Ro‘yxatdan o‘tgan a’zolar    ${m.members} (shartlarni qabul qilgan: ${m.consented})`)
  console.log(`Niyat e’lon qilish          ${activation}  ${target(activation, 60)}`)
  console.log(`Foydali match bahosi        ${usefulness}  ${target(usefulness, 25)}  · ${m.rated} baho`)
  console.log(`Kamida bitta intro so‘ragan ${pct(m.requesters, m.published)} (e’lon qilganlardan)`)
  console.log(`Ikki tomonlama qabul        ${pct(m.accepted, m.answered)} (javob berilgan intro’lardan)`)
  console.log(`7 kun ichida qaytish        ${pct(m.returned, m.eligible_for_return)} (${m.eligible_for_return} a’zo baholanadi)`)
  console.log(`Tasdiqlangan natijalar      ${m.verified_outcomes}`)
  console.log(`Ochiq shikoyatlar           ${m.open_reports}`)
} finally {
  await pool.end()
}
