BEGIN;
DROP TABLE IF EXISTS trust_signals, outcome_verifications, collaboration_milestones, collaborations CASCADE;
DROP FUNCTION IF EXISTS enforce_verification_resolution(), enforce_verification_request(), enforce_milestone_completion(), enforce_collaboration_outcome_transition();
DROP TYPE IF EXISTS outcome_verification_status, milestone_status, collaboration_status;
COMMIT;