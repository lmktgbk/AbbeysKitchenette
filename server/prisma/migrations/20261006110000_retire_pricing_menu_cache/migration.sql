-- Preserve applied migration history and recommendation history. Only obsolete
-- fetched-menu cache data and the unused hardcoded-average column are removed.
DROP TABLE "pricing_market_cache";
ALTER TABLE "price_optimizations" DROP COLUMN "competitor_avg";
