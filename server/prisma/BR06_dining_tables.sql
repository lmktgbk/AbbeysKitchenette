-- BR-06: Dining tables managed list (safe, additive — no data loss)
-- Nullable JSON: NULL means defaults (Tables 1-8 + Takeout, all enabled).
-- Run once against the database, then `npx prisma generate` (db push covers it too).
ALTER TABLE system_settings
  ADD COLUMN IF NOT EXISTS dining_tables JSONB;
