/**
 * Lock ingredient rows before reading or changing their batch stock.
 * The caller must supply its business transaction; locks last until it ends.
 * Lock each ingredient once, in UUID order, so orders and inventory adjustments
 * do not acquire the same ingredient set in opposite orders. NO KEY UPDATE
 * preserves serialization without blocking foreign-key references to the rows.
 */
export async function lockStock(tx, ingredientIds) {
  if (!ingredientIds.length) return;
  await tx.$queryRawUnsafe("SELECT ingredient_id FROM ingredients WHERE ingredient_id = ANY($1::uuid[]) ORDER BY ingredient_id FOR NO KEY UPDATE", [...new Set(ingredientIds)].sort());
}
