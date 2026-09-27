BEGIN;

-- Private alpha is invite-only: a magic link is issued only for an invited or already registered email.
CREATE TABLE invitations (
  email_normalized text PRIMARY KEY CHECK (email_normalized = lower(email_normalized) AND char_length(email_normalized) BETWEEN 3 AND 254),
  invited_by uuid REFERENCES users(id) ON DELETE SET NULL,
  note text NOT NULL DEFAULT '' CHECK (char_length(note) <= 200),
  accepted_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Only the SHA-256 of a link token is stored, so a database leak cannot be replayed as a login.
CREATE TABLE login_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_normalized text NOT NULL CHECK (email_normalized = lower(email_normalized)),
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT login_token_expiry_order CHECK (expires_at > created_at)
);
CREATE INDEX login_tokens_email_recent_idx ON login_tokens (email_normalized, created_at DESC);

COMMIT;
