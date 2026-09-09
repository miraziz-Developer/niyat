BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE user_status AS ENUM ('invited', 'active', 'suspended', 'deleted');
CREATE TYPE intent_status AS ENUM ('draft', 'active', 'paused', 'completed', 'expired');
CREATE TYPE intent_mode AS ENUM ('online', 'offline', 'hybrid');
CREATE TYPE field_visibility AS ENUM ('public', 'matched', 'private');
CREATE TYPE match_status AS ENUM ('candidate', 'shown', 'dismissed', 'intro_requested', 'connected');
CREATE TYPE intro_status AS ENUM ('pending', 'accepted', 'declined', 'cancelled', 'expired');
CREATE TYPE report_status AS ENUM ('open', 'reviewing', 'resolved', 'dismissed');

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status user_status NOT NULL DEFAULT 'invited',
  locale text NOT NULL DEFAULT 'uz',
  timezone text NOT NULL DEFAULT 'UTC',
  is_adult_confirmed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT users_deleted_state CHECK (deleted_at IS NULL OR status = 'deleted')
);

CREATE TABLE auth_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_subject text NOT NULL,
  email_normalized text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_authenticated_at timestamptz,
  UNIQUE (provider, provider_subject)
);
CREATE UNIQUE INDEX auth_identities_email_unique ON auth_identities (email_normalized) WHERE email_normalized IS NOT NULL;

CREATE TABLE profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 80),
  bio text NOT NULL DEFAULT '' CHECK (char_length(bio) <= 1000),
  city_precision text NOT NULL DEFAULT 'private' CHECK (city_precision IN ('private', 'region', 'city')),
  languages text[] NOT NULL DEFAULT '{}',
  verification_level smallint NOT NULL DEFAULT 0 CHECK (verification_level BETWEEN 0 AND 3),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
  outcome text NOT NULL CHECK (char_length(outcome) BETWEEN 1 AND 2000),
  offers text[] NOT NULL DEFAULT '{}',
  needs text[] NOT NULL DEFAULT '{}',
  topics text[] NOT NULL DEFAULT '{}',
  mode intent_mode NOT NULL,
  horizon text NOT NULL CHECK (horizon IN ('now', 'month', 'quarter')),
  status intent_status NOT NULL DEFAULT 'draft',
  visibility field_visibility NOT NULL DEFAULT 'matched',
  location text NOT NULL DEFAULT '',
  expires_at timestamptz,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT intents_publish_state CHECK ((status = 'draft' AND published_at IS NULL) OR status <> 'draft'),
  CONSTRAINT intents_expiry_order CHECK (expires_at IS NULL OR expires_at > created_at)
);
CREATE INDEX intents_owner_status_idx ON intents (owner_id, status, updated_at DESC);
CREATE INDEX intents_active_discovery_idx ON intents (updated_at DESC) WHERE status = 'active';

CREATE TABLE matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  left_intent_id uuid NOT NULL REFERENCES intents(id) ON DELETE CASCADE,
  right_intent_id uuid NOT NULL REFERENCES intents(id) ON DELETE CASCADE,
  score numeric(5,2) NOT NULL CHECK (score BETWEEN 0 AND 100),
  explanation jsonb NOT NULL DEFAULT '{}'::jsonb,
  model_version text NOT NULL,
  status match_status NOT NULL DEFAULT 'candidate',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT matches_distinct_intents CHECK (left_intent_id <> right_intent_id),
  CONSTRAINT matches_canonical_order CHECK (left_intent_id < right_intent_id),
  UNIQUE (left_intent_id, right_intent_id)
);
CREATE INDEX matches_left_status_score_idx ON matches (left_intent_id, status, score DESC);
CREATE INDEX matches_right_status_score_idx ON matches (right_intent_id, status, score DESC);

CREATE TABLE intro_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  receiver_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope text NOT NULL CHECK (char_length(scope) BETWEEN 1 AND 200),
  message text NOT NULL DEFAULT '' CHECK (char_length(message) <= 2000),
  status intro_status NOT NULL DEFAULT 'pending',
  expires_at timestamptz NOT NULL,
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT intro_distinct_participants CHECK (sender_id <> receiver_id),
  CONSTRAINT intro_response_state CHECK ((status = 'pending' AND responded_at IS NULL) OR status <> 'pending'),
  CONSTRAINT intro_expiry_order CHECK (expires_at > created_at)
);
CREATE UNIQUE INDEX intro_one_pending_per_sender_match_idx ON intro_requests (match_id, sender_id) WHERE status = 'pending';
CREATE INDEX intro_receiver_inbox_idx ON intro_requests (receiver_id, status, created_at DESC);
CREATE INDEX intro_sender_outbox_idx ON intro_requests (sender_id, status, created_at DESC);

CREATE FUNCTION enforce_intro_transition() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  actor uuid := nullif(current_setting('app.user_id', true), '')::uuid;
BEGIN
  IF ROW(NEW.match_id, NEW.sender_id, NEW.receiver_id, NEW.scope, NEW.message, NEW.expires_at, NEW.created_at)
     IS DISTINCT FROM ROW(OLD.match_id, OLD.sender_id, OLD.receiver_id, OLD.scope, OLD.message, OLD.expires_at, OLD.created_at) THEN
    RAISE EXCEPTION 'intro request identity and content are immutable';
  END IF;
  IF OLD.status <> 'pending' OR NEW.status = 'pending' THEN
    RAISE EXCEPTION 'illegal intro request transition';
  END IF;
  IF NEW.status IN ('accepted', 'declined') AND actor IS DISTINCT FROM OLD.receiver_id THEN
    RAISE EXCEPTION 'only receiver may accept or decline';
  END IF;
  IF NEW.status = 'cancelled' AND actor IS DISTINCT FROM OLD.sender_id THEN
    RAISE EXCEPTION 'only sender may cancel';
  END IF;
  IF NEW.status = 'expired' AND actor IS NOT NULL THEN
    RAISE EXCEPTION 'only system may expire';
  END IF;
  NEW.responded_at := now();
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER intro_requests_transition_guard BEFORE UPDATE ON intro_requests
FOR EACH ROW EXECUTE FUNCTION enforce_intro_transition();

CREATE TABLE blocks (
  blocker_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason text CHECK (reason IS NULL OR char_length(reason) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CONSTRAINT blocks_no_self CHECK (blocker_id <> blocked_id)
);
CREATE INDEX blocks_blocked_idx ON blocks (blocked_id, blocker_id);

CREATE TABLE reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_type text NOT NULL CHECK (subject_type IN ('user', 'intent', 'intro_request')),
  subject_id uuid NOT NULL,
  reason_code text NOT NULL,
  details text NOT NULL DEFAULT '' CHECK (char_length(details) <= 2000),
  status report_status NOT NULL DEFAULT 'open',
  assigned_moderator_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE INDEX reports_queue_idx ON reports (status, created_at);
CREATE INDEX reports_reporter_idx ON reports (reporter_id, created_at DESC);

CREATE TABLE audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id uuid,
  request_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_events_resource_idx ON audit_events (resource_type, resource_id, occurred_at DESC);
CREATE INDEX audit_events_actor_idx ON audit_events (actor_id, occurred_at DESC);

CREATE FUNCTION reject_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only';
END;
$$;
CREATE TRIGGER audit_events_immutable BEFORE UPDATE OR DELETE ON audit_events
FOR EACH ROW EXECUTE FUNCTION reject_audit_mutation();

ALTER TABLE intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE intro_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY intents_owner_all ON intents USING (owner_id = nullif(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK (owner_id = nullif(current_setting('app.user_id', true), '')::uuid);
CREATE POLICY intro_participant_read ON intro_requests FOR SELECT USING (
  sender_id = nullif(current_setting('app.user_id', true), '')::uuid OR receiver_id = nullif(current_setting('app.user_id', true), '')::uuid
);
CREATE POLICY intro_sender_create ON intro_requests FOR INSERT WITH CHECK (sender_id = nullif(current_setting('app.user_id', true), '')::uuid);
CREATE POLICY intro_participant_update ON intro_requests FOR UPDATE USING (
  sender_id = nullif(current_setting('app.user_id', true), '')::uuid OR receiver_id = nullif(current_setting('app.user_id', true), '')::uuid
);
CREATE POLICY blocks_owner_all ON blocks USING (blocker_id = nullif(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK (blocker_id = nullif(current_setting('app.user_id', true), '')::uuid);
CREATE POLICY reports_owner_read ON reports FOR SELECT USING (reporter_id = nullif(current_setting('app.user_id', true), '')::uuid);
CREATE POLICY reports_owner_create ON reports FOR INSERT WITH CHECK (reporter_id = nullif(current_setting('app.user_id', true), '')::uuid);

COMMIT;