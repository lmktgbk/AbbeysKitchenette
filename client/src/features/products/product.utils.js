/**
 * Product Utilities
 *
 * Shared helper functions for the products feature.
 * Used by ProductCard, ProductDetailModal, ProductsPage, etc.
 */

/**
 * Format a price range label from min/max prices.
 * @param {number|null} minPrice
 * @param {number|null} maxPrice
 * @returns {string} — formatted label like "₱100 – ₱150", "₱100", or "No price"
 */
export function formatPriceRange(minPrice, maxPrice) {
  const min = minPrice ?? 0;
  const max = maxPrice ?? 0;
  const hasPrice = minPrice != null || maxPrice != null;

  if (!hasPrice || (min === 0 && max === 0)) return "No price";
  if (min === max) return `₱${min.toLocaleString()}`;
  return `₱${min.toLocaleString()} – ₱${max.toLocaleString()}`;
}

/**
 * Determine if a product is effectively active (sellable).
 * A product is sellable if at least 1 variant is both is_available and has sufficient stock.
 * The product-level is_available flag is NOT used — it controls POS visibility, not sellability.
 * @param {object} product — { has_active_variant, is_available, variants }
 * @returns {boolean}
 */
export function isProductActive(product) {
  if (product.has_active_variant != null) return product.has_active_variant;
  return product.variants?.some((v) => v.is_available && v.is_stock_sufficient) ?? false;
}

/**
 * Extract API error message from axios error.
 * @param {Error} err — axios error
 * @param {string} fallback — fallback message
 * @returns {string}
 */
export function getApiErrorMessage(err, fallback = "An error occurred") {
  return err?.response?.data?.message || fallback;
}
