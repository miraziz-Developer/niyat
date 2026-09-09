BEGIN;
DROP TABLE IF EXISTS audit_events, reports, blocks, intro_requests, matches, intents, profiles, auth_identities, users CASCADE;
DROP FUNCTION IF EXISTS enforce_intro_transition(), reject_audit_mutation();
DROP TYPE IF EXISTS report_status, intro_status, match_status, field_visibility, intent_mode, intent_status, user_status;
COMMIT;