-- SEC03: case-insensitive product-name uniqueness.
-- "Spanish Latte" and "spAnish Latte" are the same product and must never
-- coexist. Prisma cannot express an expression index, so it lives here.
-- Pre-checked 2026-09-23: zero existing case-duplicates.
-- Idempotent: safe to re-run.

CREATE UNIQUE INDEX IF NOT EXISTS products_name_ci_uniq
  ON products (lower(product_name));
