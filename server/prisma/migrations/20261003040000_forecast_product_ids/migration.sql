BEGIN;
-- Preserve historical integer values while adopting the catalog's UUID identity.
ALTER TABLE public.forecast_results RENAME COLUMN product_id TO legacy_product_id;
ALTER TABLE public.forecast_results ADD COLUMN product_id UUID;
UPDATE public.forecast_results AS result
SET product_id = variant.product_id
FROM public.product_variants AS variant
WHERE result.variant_id = variant.variant_id;
COMMIT;
