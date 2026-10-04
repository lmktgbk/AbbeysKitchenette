-- Reuse the leased run ledger for internal anomaly triggers. Scheduler settings
-- govern scheduled jobs only; anomaly triggers are admitted from durable audits.
ALTER TABLE automation_runs DROP CONSTRAINT automation_runs_kind_check;
ALTER TABLE automation_runs ADD CONSTRAINT automation_runs_kind_check
  CHECK (kind IN ('forecast', 'marketBasket', 'reorder', 'waste', 'dailyReport', 'anomaly'));

CREATE INDEX shifts_opened_at_idx ON shifts (opened_at);
