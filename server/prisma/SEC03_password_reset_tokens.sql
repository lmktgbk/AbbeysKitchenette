-- SEC03: DB-backed password-reset tokens for single-use email links.
-- Stateless JWTs alone are replayable within their 15m window; this table
-- records every issued link (sha256 hash, never the raw token) so each link
-- burns on first successful use (used_at) and only the latest link per user
-- stays valid. Follows the SEC02 otp_codes pattern.
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id         SERIAL PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS password_reset_tokens_user_id_idx ON password_reset_tokens(user_id);
