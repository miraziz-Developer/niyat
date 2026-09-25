BEGIN;

CREATE TYPE collaboration_status AS ENUM ('active', 'outcome-ready', 'verification-pending', 'verified');
CREATE TYPE milestone_status AS ENUM ('pending', 'completed');
CREATE TYPE outcome_verification_status AS ENUM ('pending', 'confirmed', 'disputed');

CREATE TABLE collaborations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intro_request_id uuid NOT NULL UNIQUE REFERENCES intro_requests(id) ON DELETE CASCADE,
  creator_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  counterparty_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
  status collaboration_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT collaboration_distinct_participants CHECK (creator_id <> counterparty_id)
);
CREATE INDEX collaborations_creator_idx ON collaborations (creator_id, updated_at DESC);
CREATE INDEX collaborations_counterparty_idx ON collaborations (counterparty_id, updated_at DESC);

CREATE TABLE collaboration_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collaboration_id uuid NOT NULL REFERENCES collaborations(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  position smallint NOT NULL CHECK (position > 0),
  status milestone_status NOT NULL DEFAULT 'pending',
  completed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  completed_at timestamptz,
  CONSTRAINT milestone_completion_state CHECK ((status = 'pending' AND completed_at IS NULL AND completed_by IS NULL) OR (status = 'completed' AND completed_at IS NOT NULL AND completed_by IS NOT NULL)),
  UNIQUE (collaboration_id, position)
);

CREATE TABLE outcome_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collaboration_id uuid NOT NULL REFERENCES collaborations(id) ON DELETE CASCADE,
  requester_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  evidence text NOT NULL CHECK (char_length(evidence) BETWEEN 1 AND 2000),
  status outcome_verification_status NOT NULL DEFAULT 'pending',
  requested_at timestamptz NOT NULL DEFAULT now(),
  resolved_by uuid REFERENCES users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  CONSTRAINT verification_resolution_state CHECK ((status = 'pending' AND resolved_at IS NULL AND resolved_by IS NULL) OR (status <> 'pending' AND resolved_at IS NOT NULL AND resolved_by IS NOT NULL))
);
CREATE UNIQUE INDEX outcome_one_pending_per_collaboration_idx ON outcome_verifications (collaboration_id) WHERE status = 'pending';

CREATE TABLE trust_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collaboration_id uuid NOT NULL UNIQUE REFERENCES collaborations(id) ON DELETE CASCADE,
  verification_id uuid NOT NULL UNIQUE REFERENCES outcome_verifications(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  attester_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 160),
  issued_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT trust_distinct_participants CHECK (subject_id <> attester_id)
);
CREATE INDEX trust_signals_subject_idx ON trust_signals (subject_id, issued_at DESC);

CREATE FUNCTION enforce_collaboration_outcome_transition() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE actor uuid := nullif(current_setting('app.user_id', true), '')::uuid;
BEGIN
  IF actor IS NULL OR actor NOT IN (OLD.creator_id, OLD.counterparty_id) THEN RAISE EXCEPTION 'only collaboration participants may update'; END IF;
  IF ROW(NEW.intro_request_id, NEW.creator_id, NEW.counterparty_id, NEW.title, NEW.created_at)
     IS DISTINCT FROM ROW(OLD.intro_request_id, OLD.creator_id, OLD.counterparty_id, OLD.title, OLD.created_at) THEN RAISE EXCEPTION 'collaboration identity and content are immutable'; END IF;
  IF NOT ((OLD.status = 'active' AND NEW.status = 'outcome-ready')
       OR (OLD.status = 'outcome-ready' AND NEW.status = 'verification-pending')
       OR (OLD.status = 'verification-pending' AND NEW.status IN ('verified', 'outcome-ready'))) THEN RAISE EXCEPTION 'illegal collaboration transition'; END IF;
  IF NEW.status = 'outcome-ready' AND OLD.status = 'active' AND EXISTS (SELECT 1 FROM collaboration_milestones WHERE collaboration_id = OLD.id AND status <> 'completed') THEN RAISE EXCEPTION 'all milestones must be completed'; END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER collaboration_outcome_transition_guard BEFORE UPDATE ON collaborations FOR EACH ROW EXECUTE FUNCTION enforce_collaboration_outcome_transition();

CREATE FUNCTION enforce_milestone_completion() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE actor uuid := nullif(current_setting('app.user_id', true), '')::uuid; participant boolean;
BEGIN
  SELECT actor IN (creator_id, counterparty_id) INTO participant FROM collaborations WHERE id = OLD.collaboration_id AND status = 'active';
  IF NOT participant THEN RAISE EXCEPTION 'only participants may complete active collaboration milestones'; END IF;
  IF ROW(NEW.collaboration_id, NEW.title, NEW.position) IS DISTINCT FROM ROW(OLD.collaboration_id, OLD.title, OLD.position)
     OR OLD.status <> 'pending' OR NEW.status <> 'completed' OR NEW.completed_by IS DISTINCT FROM actor OR NEW.completed_at IS NULL THEN RAISE EXCEPTION 'illegal milestone transition'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER milestone_completion_guard BEFORE UPDATE ON collaboration_milestones FOR EACH ROW EXECUTE FUNCTION enforce_milestone_completion();

CREATE FUNCTION enforce_verification_request() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE actor uuid := nullif(current_setting('app.user_id', true), '')::uuid; eligible boolean;
BEGIN
  SELECT actor IN (creator_id, counterparty_id) AND status = 'outcome-ready' INTO eligible FROM collaborations WHERE id = NEW.collaboration_id;
  IF NOT eligible OR NEW.requester_id IS DISTINCT FROM actor OR NEW.status <> 'pending' THEN RAISE EXCEPTION 'invalid verification requester or collaboration state'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER outcome_verification_request_guard BEFORE INSERT ON outcome_verifications FOR EACH ROW EXECUTE FUNCTION enforce_verification_request();

CREATE FUNCTION enforce_verification_resolution() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE actor uuid := nullif(current_setting('app.user_id', true), '')::uuid; participant boolean;
BEGIN
  SELECT actor IN (creator_id, counterparty_id) INTO participant FROM collaborations WHERE id = OLD.collaboration_id;
  IF NOT participant OR actor = OLD.requester_id THEN RAISE EXCEPTION 'only a distinct counterparty may resolve verification'; END IF;
  IF OLD.status <> 'pending' OR NEW.status NOT IN ('confirmed', 'disputed') THEN RAISE EXCEPTION 'only pending verification may be resolved'; END IF;
  NEW.resolved_by := actor; NEW.resolved_at := now(); RETURN NEW;
END;
$$;
CREATE TRIGGER outcome_verification_resolution_guard BEFORE UPDATE OF status ON outcome_verifications FOR EACH ROW EXECUTE FUNCTION enforce_verification_resolution();

ALTER TABLE collaborations ENABLE ROW LEVEL SECURITY;
ALTER TABLE collaboration_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE outcome_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE trust_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY collaboration_participant_all ON collaborations USING (nullif(current_setting('app.user_id', true), '')::uuid IN (creator_id, counterparty_id)) WITH CHECK (nullif(current_setting('app.user_id', true), '')::uuid IN (creator_id, counterparty_id));
CREATE POLICY milestone_participant_all ON collaboration_milestones USING (EXISTS (SELECT 1 FROM collaborations c WHERE c.id = collaboration_id AND nullif(current_setting('app.user_id', true), '')::uuid IN (c.creator_id, c.counterparty_id))) WITH CHECK (EXISTS (SELECT 1 FROM collaborations c WHERE c.id = collaboration_id AND nullif(current_setting('app.user_id', true), '')::uuid IN (c.creator_id, c.counterparty_id)));
CREATE POLICY verification_participant_all ON outcome_verifications USING (EXISTS (SELECT 1 FROM collaborations c WHERE c.id = collaboration_id AND nullif(current_setting('app.user_id', true), '')::uuid IN (c.creator_id, c.counterparty_id))) WITH CHECK (EXISTS (SELECT 1 FROM collaborations c WHERE c.id = collaboration_id AND nullif(current_setting('app.user_id', true), '')::uuid IN (c.creator_id, c.counterparty_id)));
CREATE POLICY trust_subject_read ON trust_signals FOR SELECT USING (subject_id = nullif(current_setting('app.user_id', true), '')::uuid OR attester_id = nullif(current_setting('app.user_id', true), '')::uuid);
CREATE POLICY trust_participant_insert ON trust_signals FOR INSERT WITH CHECK (attester_id = nullif(current_setting('app.user_id', true), '')::uuid AND subject_id <> attester_id);

COMMIT;