-- SEC01: production-readiness indexes + guards.
-- Mirrors the @@index(map: ...) entries in schema.prisma so a future
-- `prisma db push` converges instead of duplicating.
-- Plain (non-concurrent) CREATE INDEX: tables are a few thousand rows,
-- locks last milliseconds. Pre-checked 2026-09-22: zero negative
-- quantity_left/total_amount/amount_paid, zero duplicate open shifts.
-- Idempotent: safe to re-run (IF NOT EXISTS + constraint guards).

CREATE INDEX IF NOT EXISTS order_items_order_id_idx ON order_items(order_id);
CREATE INDEX IF NOT EXISTS order_items_order_id_removed_at_idx ON order_items(order_id, removed_at);
CREATE INDEX IF NOT EXISTS order_items_variant_id_idx ON order_items(variant_id);

CREATE INDEX IF NOT EXISTS restock_batches_ingredient_id_idx ON restock_batches(ingredient_id);
CREATE INDEX IF NOT EXISTS restock_batches_ingredient_id_quantity_left_idx ON restock_batches(ingredient_id, quantity_left);

CREATE INDEX IF NOT EXISTS loss_records_related_order_id_idx ON loss_records(related_order_id);
CREATE INDEX IF NOT EXISTS loss_records_ingredient_id_idx ON loss_records(ingredient_id);

CREATE INDEX IF NOT EXISTS stock_adjustments_ingredient_id_adjusted_at_idx ON stock_adjustments(ingredient_id, adjusted_at);

CREATE INDEX IF NOT EXISTS stock_alerts_ingredient_id_idx ON stock_alerts(ingredient_id);
CREATE INDEX IF NOT EXISTS stock_alerts_is_resolved_idx ON stock_alerts(is_resolved);

CREATE INDEX IF NOT EXISTS notifications_type_idx ON notifications(type);
CREATE INDEX IF NOT EXISTS notifications_reference_idx ON notifications(reference_type, reference_id);

CREATE INDEX IF NOT EXISTS orders_shift_id_idx ON orders(shift_id);

CREATE INDEX IF NOT EXISTS deductions_order_id_reversed_at_idx ON order_ingredient_deductions(order_id, reversed_at);

-- One open shift per cashier at the DB level (the app pre-check is UX only).
CREATE UNIQUE INDEX IF NOT EXISTS shifts_one_open_per_user ON shifts(opened_by) WHERE status = 'open';

-- Money/stock can never go negative, even via paths that bypass Zod.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'restock_batches_quantity_left_nonneg') THEN
    ALTER TABLE restock_batches ADD CONSTRAINT restock_batches_quantity_left_nonneg CHECK (quantity_left >= 0);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_total_amount_nonneg') THEN
    ALTER TABLE orders ADD CONSTRAINT orders_total_amount_nonneg CHECK (total_amount >= 0);
  END IF;
END $$;
