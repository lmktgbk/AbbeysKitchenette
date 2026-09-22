-- SEC02: DB-backed OTP codes for admin 2FA.
-- Replaces the in-memory Map (lost on restart, divergent across instances).
-- Attempt caps + resend cooldown are enforced in otp.js; this is storage only.
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS otp_codes (
  id         SERIAL PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  code       VARCHAR(6) NOT NULL,
  attempts   INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS otp_codes_user_id_idx ON otp_codes(user_id);
