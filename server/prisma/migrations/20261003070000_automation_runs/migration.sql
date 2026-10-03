CREATE TABLE automation_runs (
  run_key VARCHAR(80) PRIMARY KEY,
  kind VARCHAR(20) NOT NULL CHECK (kind IN ('forecast', 'marketBasket', 'reorder', 'waste', 'dailyReport')),
  scheduled_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'succeeded', 'submitted', 'blocked')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  owner UUID,
  lease_expires_at TIMESTAMPTZ,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_error VARCHAR(80),
  result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX automation_runs_due_idx ON automation_runs (status, next_attempt_at, scheduled_at);
ALTER TABLE automation_runs ENABLE ROW LEVEL SECURITY;

-- Existing cron runs have no ledger. Preserve that uncertainty instead of
-- repeating a report or ML submission during the first upgraded startup.
WITH clock AS (
  SELECT clock_timestamp() AS instant, (clock_timestamp() AT TIME ZONE 'Asia/Manila')::date AS today
), schedules AS (
  SELECT entry.key AS kind, entry.value AS config
  FROM system_settings, LATERAL jsonb_each(automation) AS entry
  WHERE id = 1 AND entry.key IN ('forecast','marketBasket','reorder','waste','dailyReport')
    AND entry.value->>'enabled' = 'true'
    AND entry.value->>'frequency' IN ('daily','weekly')
    AND entry.value->>'time' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
), occurrences AS (
  SELECT kind, (date + (config->>'time')::time) AT TIME ZONE 'Asia/Manila' AS scheduled_at, clock.instant
  FROM schedules CROSS JOIN clock
  CROSS JOIN LATERAL (VALUES (clock.today), (clock.today - 1)) AS days(date)
  WHERE config->>'frequency' = 'daily' OR lower(to_char(date, 'FMDay')) = config->>'day'
)
INSERT INTO automation_runs (run_key, kind, scheduled_at, status, last_error)
SELECT kind || ':' || to_char(scheduled_at AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD'), kind, scheduled_at,
  'blocked', 'MIGRATION_HISTORY_UNKNOWN'
FROM occurrences WHERE scheduled_at <= instant AND scheduled_at >= instant - interval '24 hours';
