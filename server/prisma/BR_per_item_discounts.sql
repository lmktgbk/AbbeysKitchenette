-- Per-item discounts: at most one discount type per order line.
-- Order-level discount columns become aggregates; "mixed" = lines differ.
-- Safe, additive — no data loss. Existing orders keep order-level values;
-- their lines default to 'none' (historic display unchanged).

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS discount_type VARCHAR(20) NOT NULL DEFAULT 'none';
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS discount_percent DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS discount_label VARCHAR(200);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS senior_id_no VARCHAR(50);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pwd_id_no VARCHAR(50);

-- Backfill audit IDs: legacy single-ID orders keep discount_id_no as-is.
-- New per-item orders populate senior_id_no / pwd_id_no; discount_id_no
-- mirrors the first available ID for legacy receipt rendering.
UPDATE orders
SET senior_id_no = discount_id_no
WHERE discount_type = 'senior' AND senior_id_no IS NULL AND discount_id_no IS NOT NULL;

UPDATE orders
SET pwd_id_no = discount_id_no
WHERE discount_type = 'pwd' AND pwd_id_no IS NULL AND discount_id_no IS NOT NULL;
