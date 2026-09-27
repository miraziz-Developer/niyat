BEGIN;

-- ---------------------------------------------------------------------------
-- Consent: 18+ confirmation already lives on users; terms acceptance is versioned.
-- ---------------------------------------------------------------------------
ALTER TABLE users ADD COLUMN terms_version text, ADD COLUMN terms_accepted_at timestamptz;
ALTER TABLE users ADD CONSTRAINT users_terms_pair CHECK ((terms_version IS NULL) = (terms_accepted_at IS NULL));

-- ---------------------------------------------------------------------------
-- Notifications: rows are written in the same transaction as the event (outbox),
-- so a committed intro always yields exactly one notification attempt.
-- ---------------------------------------------------------------------------
CREATE TABLE notification_preferences (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  intro_requests boolean NOT NULL DEFAULT true,
  intro_responses boolean NOT NULL DEFAULT true,
  outcomes boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE notification_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('intro_requested', 'intro_accepted', 'verification_requested', 'verification_resolved')),
  resource_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'skipped', 'failed')),
  attempts smallint NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text CHECK (last_error IS NULL OR char_length(last_error) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);
CREATE INDEX notification_outbox_due_idx ON notification_outbox (next_attempt_at) WHERE status = 'pending';

-- ---------------------------------------------------------------------------
-- Moderation: staff roles, moderator-only decisions, suspended members leave matching.
-- ---------------------------------------------------------------------------
CREATE TABLE staff_roles (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('moderator', 'admin')),
  granted_at timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION is_moderator() RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.staff_roles
    WHERE user_id = NULLIF(pg_catalog.current_setting('app.user_id', true), '')::uuid
  );
$$;
REVOKE ALL ON FUNCTION is_moderator() FROM PUBLIC;

CREATE POLICY reports_moderator_read ON reports FOR SELECT USING (is_moderator());
CREATE POLICY reports_moderator_update ON reports FOR UPDATE USING (is_moderator()) WITH CHECK (is_moderator());

-- Reporters can never read these notes: only moderators pass the policy.
CREATE TABLE report_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  moderator_id uuid REFERENCES users(id) ON DELETE SET NULL,
  status report_status NOT NULL,
  note text NOT NULL DEFAULT '' CHECK (char_length(note) <= 2000),
  suspended_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX report_decisions_report_idx ON report_decisions (report_id, decided_at DESC);
ALTER TABLE report_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY report_decisions_moderator_all ON report_decisions USING (is_moderator()) WITH CHECK (is_moderator());

-- What a moderator needs to judge a report: a short label and the member it concerns.
-- Returns nothing for non-moderators, so it cannot be used to read other members' intents.
CREATE FUNCTION moderation_subject(subject_type text, subject_id uuid, reporter_id uuid)
RETURNS TABLE (label text, subject_user_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT
    CASE subject_type
      WHEN 'user' THEN (SELECT coalesce(display_name, 'Profilsiz a’zo') FROM public.profiles WHERE user_id = subject_id)
      WHEN 'intent' THEN (SELECT title FROM public.intents WHERE id = subject_id)
      WHEN 'intro_request' THEN (SELECT scope || ': ' || left(message, 200) FROM public.intro_requests WHERE id = subject_id)
    END,
    CASE subject_type
      WHEN 'user' THEN (SELECT id FROM public.users WHERE id = subject_id)
      WHEN 'intent' THEN (SELECT owner_id FROM public.intents WHERE id = subject_id)
      -- The reported party of an intro is whichever participant is not the reporter.
      WHEN 'intro_request' THEN (SELECT CASE WHEN sender_id = reporter_id THEN receiver_id ELSE sender_id END FROM public.intro_requests WHERE id = subject_id)
    END
  WHERE public.is_moderator();
$$;
REVOKE ALL ON FUNCTION moderation_subject(text, uuid, uuid) FROM PUBLIC;

-- Same contract as 0005, plus: candidates must belong to an active (not suspended or deleted) member.
CREATE OR REPLACE FUNCTION matchable_intents(source_intent_id uuid)
RETURNS TABLE (id uuid, offers text[], needs text[], topics text[], mode intent_mode)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT candidate.id, candidate.offers, candidate.needs, candidate.topics, candidate.mode
  FROM public.intents AS source
  JOIN public.intents AS candidate ON candidate.owner_id <> source.owner_id
  JOIN public.users AS candidate_owner ON candidate_owner.id = candidate.owner_id AND candidate_owner.status = 'active'
  WHERE source.id = source_intent_id
    AND source.owner_id = NULLIF(pg_catalog.current_setting('app.user_id', true), '')::uuid
    AND source.status = 'active'
    AND source.visibility <> 'private'
    AND candidate.status = 'active'
    AND candidate.visibility <> 'private'
    AND (candidate.expires_at IS NULL OR candidate.expires_at > pg_catalog.now())
    AND NOT EXISTS (
      SELECT 1 FROM public.blocks
      WHERE (blocker_id = source.owner_id AND blocked_id = candidate.owner_id)
         OR (blocker_id = candidate.owner_id AND blocked_id = source.owner_id)
    )
  ORDER BY candidate.updated_at DESC
  LIMIT 500;
$$;

-- ---------------------------------------------------------------------------
-- Product analytics: pseudonymous event names only, no free text.
-- ---------------------------------------------------------------------------
CREATE TABLE analytics_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  name text NOT NULL CHECK (name ~ '^[a-z_]{3,40}$'),
  properties jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (pg_column_size(properties) <= 2048),
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX analytics_events_name_time_idx ON analytics_events (name, occurred_at);
CREATE INDEX analytics_events_user_time_idx ON analytics_events (user_id, occurred_at);

CREATE TABLE match_feedback (
  match_id uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  useful boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (match_id, user_id)
);
ALTER TABLE match_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY match_feedback_owner_all ON match_feedback
  USING (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid);

-- ---------------------------------------------------------------------------
-- Maintenance: one owner-privileged entry point, so the runtime role needs no broad DELETE grants.
-- Runs without app.user_id, which the intro trigger requires for the system-only "expired" transition.
-- ---------------------------------------------------------------------------
CREATE FUNCTION run_maintenance()
RETURNS TABLE (expired_intros integer, deleted_login_tokens integer, deleted_sessions integer, deleted_idempotency integer, deleted_notifications integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF NULLIF(pg_catalog.current_setting('app.user_id', true), '') IS NOT NULL THEN
    RAISE EXCEPTION 'maintenance must run without an actor';
  END IF;
  UPDATE public.intro_requests SET status = 'expired' WHERE status = 'pending' AND expires_at <= pg_catalog.now();
  GET DIAGNOSTICS expired_intros = ROW_COUNT;
  DELETE FROM public.login_tokens WHERE created_at < pg_catalog.now() - interval '7 days';
  GET DIAGNOSTICS deleted_login_tokens = ROW_COUNT;
  DELETE FROM public.sessions WHERE expires_at < pg_catalog.now() - interval '30 days' OR revoked_at < pg_catalog.now() - interval '30 days';
  GET DIAGNOSTICS deleted_sessions = ROW_COUNT;
  DELETE FROM public.idempotency_records WHERE expires_at < pg_catalog.now();
  GET DIAGNOSTICS deleted_idempotency = ROW_COUNT;
  DELETE FROM public.notification_outbox WHERE status IN ('sent', 'skipped') AND created_at < pg_catalog.now() - interval '30 days';
  GET DIAGNOSTICS deleted_notifications = ROW_COUNT;
  RETURN NEXT;
END;
$$;
REVOKE ALL ON FUNCTION run_maintenance() FROM PUBLIC;

COMMIT;
