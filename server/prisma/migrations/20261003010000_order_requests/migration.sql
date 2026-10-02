BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE TABLE "public"."order_requests" (
  "scope" VARCHAR(160) NOT NULL,
  "key" UUID NOT NULL,
  "request_hash" VARCHAR(64) NOT NULL,
  "response" JSONB,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "order_requests_pkey" PRIMARY KEY ("scope", "key")
);
-- Guest replay results contain tracking capabilities. Only the backend database
-- role should read them; Supabase public clients receive no table access.
ALTER TABLE "public"."order_requests" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."order_requests" FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "public"."order_requests" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON "public"."order_requests" FROM authenticated;
  END IF;
END $$;
COMMIT;
