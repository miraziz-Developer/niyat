BEGIN;

CREATE FUNCTION eligible_intro_receiver(candidate_match_id uuid, actor_id uuid) RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT CASE WHEN left_intent.owner_id = actor_id THEN right_intent.owner_id ELSE left_intent.owner_id END
  FROM public.matches
  JOIN public.intents AS left_intent ON left_intent.id = matches.left_intent_id
  JOIN public.intents AS right_intent ON right_intent.id = matches.right_intent_id
  WHERE matches.id = candidate_match_id
    AND actor_id = NULLIF(pg_catalog.current_setting('app.user_id', true), '')::uuid
    AND actor_id IN (left_intent.owner_id, right_intent.owner_id)
    AND left_intent.owner_id <> right_intent.owner_id
    AND matches.status IN ('candidate', 'shown')
    AND NOT EXISTS (
      SELECT 1 FROM public.blocks
      WHERE (blocker_id = left_intent.owner_id AND blocked_id = right_intent.owner_id)
         OR (blocker_id = right_intent.owner_id AND blocked_id = left_intent.owner_id)
    );
$$;

REVOKE ALL ON FUNCTION eligible_intro_receiver(uuid, uuid) FROM PUBLIC;

COMMIT;