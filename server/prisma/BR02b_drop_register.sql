-- BR-02b: registers were invented (Abbey's has no counters).
-- Drop the column; a shift is identified by cashier + window.
ALTER TABLE shifts DROP COLUMN IF EXISTS register_label;
DROP INDEX IF EXISTS shifts_register_label_idx;
