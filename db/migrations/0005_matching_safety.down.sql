BEGIN;
DROP TRIGGER IF EXISTS audit_events_no_truncate ON audit_events;
DROP FUNCTION IF EXISTS match_counterpart(uuid);
DROP FUNCTION IF EXISTS matchable_intents(uuid);
DROP POLICY IF EXISTS matches_participant_all ON matches;
ALTER TABLE matches DISABLE ROW LEVEL SECURITY;
DROP FUNCTION IF EXISTS owns_intent(uuid);
COMMIT;
