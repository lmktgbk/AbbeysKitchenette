CREATE TABLE "email_change_requests" (
  "id" UUID PRIMARY KEY,
  "user_id" UUID NOT NULL UNIQUE REFERENCES "User"("id") ON DELETE CASCADE,
  "old_email" TEXT NOT NULL,
  "new_email" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code_hash" VARCHAR(64) NOT NULL,
  "session_version" INTEGER NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- Verification data is server-only; Supabase public roles receive no access policy.
ALTER TABLE "email_change_requests" ENABLE ROW LEVEL SECURITY;
