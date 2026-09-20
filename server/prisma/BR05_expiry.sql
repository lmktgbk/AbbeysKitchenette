-- BR-05: optional expiry dates on restock batches + expiry alert types.
-- Additive only. Existing batches read as "no expiry date".
-- NOTE: ALTER TYPE ... ADD VALUE cannot run inside a transaction block;
-- run these statements separately (not wrapped in BEGIN/COMMIT).
ALTER TABLE restock_batches ADD COLUMN IF NOT EXISTS expiry_date DATE;
ALTER TYPE alert_type_enum ADD VALUE IF NOT EXISTS 'expiring_soon';
ALTER TYPE alert_type_enum ADD VALUE IF NOT EXISTS 'expired';
