-- SEC04: Sheet sync log for Google Sheets live order sync.
-- One row per paid order (order_id unique) so appends are idempotent and
-- retryable: pending → synced, failures stay pending with attempts/last_error
-- for the nightly reconciler to backfill. No FK to orders (log must survive
-- order deletes for audit parity).
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS sheet_sync_log (
  id         SERIAL PRIMARY KEY,
  order_id   UUID NOT NULL,
  kind       VARCHAR(20) NOT NULL DEFAULT 'paid',
  status     VARCHAR(20) NOT NULL DEFAULT 'pending',
  attempts   INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  synced_at  TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sheet_sync_log_order_kind_unique UNIQUE (order_id, kind)
);

CREATE INDEX IF NOT EXISTS sheet_sync_log_status_idx ON sheet_sync_log(status);
