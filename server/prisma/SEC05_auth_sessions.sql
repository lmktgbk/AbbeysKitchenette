-- Apply to Supabase before deploying the authentication changes.
-- Existing session/challenge tokens are deliberately rejected by the new JWT contract.
BEGIN;

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE otp_codes ALTER COLUMN code TYPE VARCHAR(64);
ALTER TABLE otp_codes ADD COLUMN IF NOT EXISTS challenge_id UUID NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS otp_codes_challenge_id_key ON otp_codes(challenge_id);

COMMIT;
