/** money — peso/variance formatters. WHY it exists: single ₱ + sign convention (U+2212 minus) so POS and reports never drift; consumed by order summaries and forecasts. State: none. */
/**
 * Money formatting helpers.
 */

/**
 * Format a peso amount: ₱1,050
 */
export function formatPeso(n) {
  return `₱${Number(n ?? 0).toLocaleString()}`;
}

/**
 * Format a variance with the sign before the peso mark:
 * +₱20, −₱20 (U+2212), ₱0
 */
export function formatVariance(v) {
  const n = Number(v ?? 0);
  if (n > 0) return `+₱${n.toLocaleString()}`;
  if (n < 0) return `−₱${Math.abs(n).toLocaleString()}`;
  return "₱0";
}
