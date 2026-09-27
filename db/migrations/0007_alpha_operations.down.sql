BEGIN;
DROP FUNCTION IF EXISTS run_maintenance();
DROP FUNCTION IF EXISTS moderation_subject(text, uuid, uuid);
DROP TABLE IF EXISTS match_feedback, analytics_events, report_decisions, notification_outbox, notification_preferences;
DROP POLICY IF EXISTS reports_moderator_read ON reports;
DROP POLICY IF EXISTS reports_moderator_update ON reports;
DROP FUNCTION IF EXISTS is_moderator();
DROP TABLE IF EXISTS staff_roles;
-- Restore the 0005 candidate rule (without the active-owner join).
CREATE OR REPLACE FUNCTION matchable_intents(source_intent_id uuid)
RETURNS TABLE (id uuid, offers text[], needs text[], topics text[], mode intent_mode)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT candidate.id, candidate.offers, candidate.needs, candidate.topics, candidate.mode
  FROM public.intents AS source
  JOIN public.intents AS candidate ON candidate.owner_id <> source.owner_id
  WHERE source.id = source_intent_id
    AND source.owner_id = NULLIF(pg_catalog.current_setting('app.user_id', true), '')::uuid
    AND source.status = 'active' AND source.visibility <> 'private'
    AND candidate.status = 'active' AND candidate.visibility <> 'private'
    AND (candidate.expires_at IS NULL OR candidate.expires_at > pg_catalog.now())
    AND NOT EXISTS (SELECT 1 FROM public.blocks WHERE (blocker_id = source.owner_id AND blocked_id = candidate.owner_id) OR (blocker_id = candidate.owner_id AND blocked_id = source.owner_id))
  ORDER BY candidate.updated_at DESC LIMIT 500;
$$;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_terms_pair, DROP COLUMN IF EXISTS terms_accepted_at, DROP COLUMN IF EXISTS terms_version;
COMMIT;
