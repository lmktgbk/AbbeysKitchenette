ALTER TABLE "price_optimizations" ADD COLUMN "policy_version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "pricing_context" JSONB;
CREATE TABLE "pricing_market_cache" (
  "product_id" UUID PRIMARY KEY REFERENCES "products"("product_id") ON DELETE CASCADE,
  "context" JSONB NOT NULL,
  "refreshed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
