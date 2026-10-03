/** Serialize stock snapshots across batches, including concurrent restocks.
 * Stable ingredient ordering avoids opposite-order locks for multi-item orders.
 */
export async function lockStock(tx, ingredientIds) {
  if (!ingredientIds.length) return;
  await tx.$queryRawUnsafe("SELECT ingredient_id FROM ingredients WHERE ingredient_id = ANY($1::uuid[]) ORDER BY ingredient_id FOR NO KEY UPDATE", [...new Set(ingredientIds)].sort());
}
