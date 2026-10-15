import { MANILA_TODAY_SQL } from "../../config/time.js";

/** Static SQL shared by the catalog, filters and summary. Aliases are repository-owned. */
export const VARIANT_SELLABLE_SQL = `pv.is_available = true AND pv.is_manually_deactivated = false
  AND EXISTS (SELECT 1 FROM recipes r WHERE r.variant_id = pv.variant_id)
  AND NOT EXISTS (SELECT 1 FROM recipes r JOIN ingredients i USING (ingredient_id)
    WHERE r.variant_id = pv.variant_id AND (i.is_archived = true OR COALESCE((
      SELECT SUM(rb.quantity_left) FROM restock_batches rb WHERE rb.ingredient_id = r.ingredient_id
      AND rb.quantity_left > 0 AND (rb.expiry_date IS NULL OR rb.expiry_date >= ${MANILA_TODAY_SQL})
    ), 0) < r.quantity_needed))`;
export const PRODUCT_ENABLED_SQL = `p.is_available = true AND EXISTS
  (SELECT 1 FROM subcategories s WHERE s.subcategory_id = p.subcategory_id AND s.is_active = true)`;
export const AVAILABLE_VARIANTS_SQL = `(SELECT COUNT(*)::int FROM product_variants pv
  WHERE pv.product_id = p.product_id AND ${VARIANT_SELLABLE_SQL})`;
export const PRODUCT_SELLABLE_SQL = `(${PRODUCT_ENABLED_SQL} AND ${AVAILABLE_VARIANTS_SQL} > 0)`;
export const PRODUCT_STATUS_SQL = `CASE
  WHEN NOT (${PRODUCT_ENABLED_SQL}) THEN 'deactivated'
  WHEN ${AVAILABLE_VARIANTS_SQL} > 0 THEN CASE WHEN ${AVAILABLE_VARIANTS_SQL} =
    (SELECT COUNT(*) FROM product_variants pv WHERE pv.product_id = p.product_id) THEN 'available' ELSE 'partial' END
  WHEN EXISTS (SELECT 1 FROM product_variants pv WHERE pv.product_id = p.product_id)
    AND NOT EXISTS (SELECT 1 FROM product_variants pv WHERE pv.product_id = p.product_id AND pv.is_manually_deactivated = false)
    THEN 'deactivated'
  WHEN NOT EXISTS (SELECT 1 FROM product_variants pv WHERE pv.product_id = p.product_id AND pv.is_manually_deactivated = false
    AND EXISTS (SELECT 1 FROM recipes r WHERE r.variant_id = pv.variant_id)
    AND NOT EXISTS (SELECT 1 FROM recipes r JOIN ingredients i USING (ingredient_id) WHERE r.variant_id = pv.variant_id AND i.is_archived = true))
    THEN 'setup_needed'
  ELSE 'out_of_stock' END`;

/** Live recipe checks used by both the public/POS menu and product details. */
export function variantHasStock(variant, stock) {
  return variant.recipes.length > 0 && variant.recipes.every(r => !r.ingredient?.isArchived &&
    (stock[r.ingredientId] ?? 0) >= Number(r.quantityNeeded));
}
export function variantSellable(variant, stock) {
  return variant.isAvailable && !variant.isManuallyDeactivated && variantHasStock(variant, stock);
}
