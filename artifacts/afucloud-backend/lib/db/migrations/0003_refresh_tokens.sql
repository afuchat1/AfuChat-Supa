-- Refresh-token persistence used by the AfuCloud API login flow.
-- Safe to run repeatedly against an existing Supabase database.
CREATE SCHEMA IF NOT EXISTS afucloud;

CREATE TABLE IF NOT EXISTS afucloud.refresh_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS refresh_tokens_user_id_idx
  ON afucloud.refresh_tokens(user_id);

CREATE INDEX IF NOT EXISTS refresh_tokens_expires_at_idx
  ON afucloud.refresh_tokens(expires_at);