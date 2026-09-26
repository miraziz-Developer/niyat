BEGIN;

-- Actor identity for every policy and function below comes from the transaction-local app.user_id.

CREATE FUNCTION owns_intent(candidate_intent_id uuid) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.intents
    WHERE id = candidate_intent_id
      AND owner_id = NULLIF(pg_catalog.current_setting('app.user_id', true), '')::uuid
  );
$$;
REVOKE ALL ON FUNCTION owns_intent(uuid) FROM PUBLIC;

ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY matches_participant_all ON matches
  USING (owns_intent(left_intent_id) OR owns_intent(right_intent_id))
  WITH CHECK (owns_intent(left_intent_id) OR owns_intent(right_intent_id));

-- Candidates for one owned, active, non-private intent. Private intents never enter matching
-- in either direction, and a block edge in either direction excludes the pair.
CREATE FUNCTION matchable_intents(source_intent_id uuid)
RETURNS TABLE (id uuid, offers text[], needs text[], topics text[], mode intent_mode)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT candidate.id, candidate.offers, candidate.needs, candidate.topics, candidate.mode
  FROM public.intents AS source
  JOIN public.intents AS candidate ON candidate.owner_id <> source.owner_id
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
REVOKE ALL ON FUNCTION matchable_intents(uuid) FROM PUBLIC;

-- The other side of a match, as the current actor may see it. Display name is revealed only
-- after an intro on this match was accepted. Blocked pairs return no row.
CREATE FUNCTION match_counterpart(candidate_match_id uuid)
RETURNS TABLE (
  viewer_intent_id uuid,
  intent_id uuid,
  owner_id uuid,
  title text,
  outcome text,
  offers text[],
  needs text[],
  topics text[],
  mode intent_mode,
  horizon text,
  intent_status intent_status,
  display_name text,
  verification_level smallint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  WITH actor AS (
    SELECT NULLIF(pg_catalog.current_setting('app.user_id', true), '')::uuid AS id
  ), pair AS (
    SELECT matches.id, left_intent.id AS left_id, left_intent.owner_id AS left_owner, right_intent.id AS right_id
    FROM public.matches
    JOIN public.intents AS left_intent ON left_intent.id = matches.left_intent_id
    JOIN public.intents AS right_intent ON right_intent.id = matches.right_intent_id
    CROSS JOIN actor
    WHERE matches.id = candidate_match_id
      AND actor.id IN (left_intent.owner_id, right_intent.owner_id)
  )
  SELECT
    CASE WHEN pair.left_owner = actor.id THEN pair.left_id ELSE pair.right_id END,
    other.id, other.owner_id, other.title, other.outcome, other.offers, other.needs, other.topics, other.mode, other.horizon, other.status,
    CASE WHEN EXISTS (
      SELECT 1 FROM public.intro_requests WHERE intro_requests.match_id = pair.id AND intro_requests.status = 'accepted'
    ) THEN profile.display_name END,
    COALESCE(profile.verification_level, 0::smallint)
  FROM pair
  CROSS JOIN actor
  JOIN public.intents AS other ON other.id = CASE WHEN pair.left_owner = actor.id THEN pair.right_id ELSE pair.left_id END
  LEFT JOIN public.profiles AS profile ON profile.user_id = other.owner_id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.blocks
    WHERE (blocker_id = actor.id AND blocked_id = other.owner_id)
       OR (blocker_id = other.owner_id AND blocked_id = actor.id)
  );
$$;
REVOKE ALL ON FUNCTION match_counterpart(uuid) FROM PUBLIC;

COMMIT;
