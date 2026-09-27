import pg from 'pg'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL is required')

const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 })

try {
  await pool.query(`
    INSERT INTO users (id, status, locale, timezone, is_adult_confirmed) VALUES
      ('00000000-0000-4000-8000-000000000001', 'active', 'uz', 'Asia/Tashkent', true),
      ('00000000-0000-4000-8000-000000000002', 'active', 'uz', 'Asia/Tashkent', true),
      ('00000000-0000-4000-8000-000000000003', 'active', 'uz', 'Asia/Tashkent', true),
      -- Deliberately without a profile: exercises first-run onboarding in the browser.
      ('00000000-0000-4000-8000-000000000004', 'active', 'uz', 'Asia/Tashkent', true)
    ON CONFLICT (id) DO NOTHING;

    -- Seeded demo members have accepted the alpha terms; the onboarding tester (…0004) has not.
    UPDATE users SET terms_version = '2026-09-alpha', terms_accepted_at = now()
    WHERE id IN ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000003')
      AND terms_version IS NULL;

    INSERT INTO profiles (user_id, display_name, bio, city_precision, languages, verification_level) VALUES
      ('00000000-0000-4000-8000-000000000001', 'Private Alpha User', 'NIYAT private alpha workspace', 'city', ARRAY['uz'], 1),
      ('00000000-0000-4000-8000-000000000002', 'Alpha Counterparty', 'Outcome verification counterparty', 'city', ARRAY['uz'], 1),
      ('00000000-0000-4000-8000-000000000003', 'Alpha Tester', 'Matching and safety tester', 'city', ARRAY['uz', 'en'], 0)
    ON CONFLICT (user_id) DO NOTHING;

    INSERT INTO intents (id, owner_id, title, outcome, offers, needs, topics, mode, horizon, status, visibility, location, published_at) VALUES
      ('00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000001', 'Niyatni imkoniyatga aylantirish', 'Private alpha orqali foydali hamkorlikni tekshirish', ARRAY['product'], ARRAY['growth'], ARRAY['community'], 'hybrid', 'quarter', 'active', 'matched', 'Toshkent', now()),
      ('00000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-000000000002', 'Hamkorlikni sinash', 'NIYAT outcome verification oqimini sinash', ARRAY['growth'], ARRAY['product'], ARRAY['community'], 'hybrid', 'quarter', 'active', 'matched', 'Toshkent', now())
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO matches (id, left_intent_id, right_intent_id, score, explanation, model_version, status) VALUES
      ('00000000-0000-4000-8000-000000000021', '00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000012', 92, '{"reason":"private-alpha-seed"}', 'seed-v1', 'connected')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO intro_requests (id, match_id, sender_id, receiver_id, scope, message, status, expires_at, responded_at) VALUES
      ('00000000-0000-4000-8000-000000000031', '00000000-0000-4000-8000-000000000021', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', 'Private alpha collaboration', 'Docker bootstrap seed', 'accepted', now() + interval '30 days', now())
    ON CONFLICT (id) DO NOTHING;
  `)
  console.log('Private alpha seed is ready.')
} finally {
  await pool.end()
}