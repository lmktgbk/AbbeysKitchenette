-- Preserve legacy delivery history; pending legacy rows cannot be reconstructed as immutable events.
DROP INDEX "sheet_sync_log_order_kind_unique";
ALTER TABLE "sheet_sync_log"
  ADD COLUMN "event_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN "event_key" VARCHAR(120),
  ADD COLUMN "payload" JSONB,
  ADD COLUMN "spreadsheet_id" VARCHAR(200),
  ADD COLUMN "sheet_row" INTEGER CHECK (sheet_row >= 2),
  ADD COLUMN "lease_owner" UUID,
  ADD COLUMN "lease_expires_at" TIMESTAMPTZ,
  ADD COLUMN "next_attempt_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "sheet_sync_log" SET event_key = CASE WHEN kind = 'paid' THEN 'paid:' || order_id::text ELSE 'legacy:' || id::text END;
UPDATE "sheet_sync_log" SET status = 'blocked', last_error = 'LEGACY_SNAPSHOT_REQUIRED' WHERE status <> 'synced';
ALTER TABLE "sheet_sync_log" ALTER COLUMN "event_key" SET NOT NULL;
CREATE UNIQUE INDEX "sheet_sync_log_event_id_key" ON "sheet_sync_log" (event_id);
CREATE UNIQUE INDEX "sheet_sync_log_event_key_key" ON "sheet_sync_log" (event_key);
CREATE UNIQUE INDEX "sheet_sync_log_destination_row_key" ON "sheet_sync_log" (spreadsheet_id, sheet_row);
CREATE INDEX "sheet_sync_log_due_idx" ON "sheet_sync_log" (status, next_attempt_at, id);
ALTER TABLE "sheet_sync_log" ENABLE ROW LEVEL SECURITY;

CREATE TABLE "sheet_sync_destinations" (
  "spreadsheet_id" VARCHAR(200) PRIMARY KEY,
  "next_row" INTEGER NOT NULL CHECK (next_row >= 2),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE "sheet_sync_destinations" ENABLE ROW LEVEL SECURITY;

CREATE TABLE "background_leases" (
  "key" VARCHAR(120) PRIMARY KEY,
  "owner" UUID,
  "expires_at" TIMESTAMPTZ,
  "next_run_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE "background_leases" ENABLE ROW LEVEL SECURITY;
