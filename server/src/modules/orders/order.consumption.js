import { AppError } from "../../middleware/errorHandler.middleware.js";

// Stock is stored to three decimal places. Integer units keep allocation and
// settlement exact, including recipe fractions spread across several batches.
/** Convert persisted stock precision into exact integer thousandths; reject values that would silently round. */
export function stockUnits(value) {
  const number = Number(value), units = Math.round(number * 1000);
  if (!Number.isFinite(number) || number < 0 || !Number.isSafeInteger(units) || Math.abs(number * 1000 - units) > 0.000001) {
    throw new AppError(400, "Stock quantities must be non-negative with at most three decimals", "INVALID_STOCK_QUANTITY");
  }
  return units;
}

/**
 * Attribute the reserved batch slices to paid items in stable item-ID order.
 * No database writes occur here. Every reserved unit must be attributed exactly
 * once; a mismatch rejects the caller's transaction instead of recording history
 * that could restore the wrong stock during cancellation or item removal.
 */
export function allocateConsumption(items, recipes, deductions) {
  const byVariant = new Map();
  for (const recipe of recipes) {
    if (!byVariant.has(recipe.variantId)) byVariant.set(recipe.variantId, []);
    byVariant.get(recipe.variantId).push(recipe);
  }
  const byIngredient = new Map();
  for (const deduction of deductions) {
    if (!byIngredient.has(deduction.ingredientId)) byIngredient.set(deduction.ingredientId, []);
    byIngredient.get(deduction.ingredientId).push({ ...deduction, remaining: stockUnits(deduction.quantityDeducted) });
  }
  const rows = [];
  const cursors = new Map();
  for (const item of [...items].sort((a, b) => a.orderItemId - b.orderItemId)) {
    for (const recipe of byVariant.get(item.variantId) || []) {
      let needed = stockUnits(recipe.quantityNeeded) * item.quantity;
      const slices = byIngredient.get(recipe.ingredientId) || [];
      let cursor = cursors.get(recipe.ingredientId) || 0;
      // Carry the FIFO cursor forward; do not rescan exhausted batches for
      // every item when a large order shares the same ingredient.
      while (needed && cursor < slices.length) {
        const slice = slices[cursor];
        const used = Math.min(needed, slice.remaining);
        if (!used) {
          cursor++;
          continue;
        }
        const { remaining: _remaining, ...data } = slice;
        rows.push({ ...data, orderItemId: item.orderItemId, quantityDeducted: used / 1000 });
        slice.remaining -= used;
        needed -= used;
        if (!slice.remaining) cursor++;
      }
      cursors.set(recipe.ingredientId, cursor);
      if (needed) throw new AppError(409, "Consumption does not match the paid items", "CONSUMPTION_CONFLICT");
    }
  }
  if ([...byIngredient.values()].flat().some(slice => slice.remaining)) {
    throw new AppError(409, "Consumption does not match the paid items", "CONSUMPTION_CONFLICT");
  }
  return rows;
}

/**
 * Partition original item consumption into restored stock and declared loss.
 * Use saved batch quantities and costs, never the current recipe or supplier
 * price. The caller persists this plan and its refund within one transaction.
 */
export function planSettlement(items, deductions, itemLosses = []) {
  const itemIds = new Set(items.map(item => item.orderItemId));
  const groups = new Map();
  for (const row of deductions) {
    if (!itemIds.has(row.orderItemId)) {
      throw new AppError(409, "Item consumption history is unavailable", "CONSUMPTION_HISTORY_REQUIRED");
    }
    const key = `${row.orderItemId}:${row.ingredientId}`;
    if (!groups.has(key)) groups.set(key, { rows: [], units: 0 });
    const group = groups.get(key);
    group.rows.push(row);
    group.units += stockUnits(row.quantityDeducted);
  }
  const declared = new Map();
  const seenItems = new Set();
  for (const entry of itemLosses) {
    if (!itemIds.has(entry.order_item_id) || seenItems.has(entry.order_item_id)) {
      throw new AppError(400, "Losses must reference distinct active order items", "INVALID_ITEM_LOSS");
    }
    seenItems.add(entry.order_item_id);
    for (const loss of entry.ingredient_losses || []) {
      const key = `${entry.order_item_id}:${loss.ingredient_id}`;
      const units = stockUnits(loss.quantity_lost);
      if (!groups.has(key) || declared.has(key) || units > groups.get(key).units) {
        throw new AppError(400, "Declared loss exceeds original consumption or repeats an ingredient", "INVALID_ITEM_LOSS");
      }
      declared.set(key, units);
    }
  }
  const settlements = [];
  const losses = [];
  for (const [key, group] of groups) {
    let lost = declared.get(key) || 0;
    let cost = 0;
    for (const row of group.rows) {
      const consumed = stockUnits(row.quantityDeducted);
      const lostHere = Math.min(lost, consumed);
      settlements.push({
        id: row.id,
        quantityRestored: (consumed - lostHere) / 1000,
        quantityLost: lostHere / 1000,
        restockBatchId: row.restockBatchId,
        ingredientId: row.ingredientId,
      });
      cost += lostHere / 1000 * Number(row.costPerUnit);
      lost -= lostHere;
    }
    const lostUnits = declared.get(key) || 0;
    if (lostUnits) losses.push({ ingredientId: group.rows[0].ingredientId, relatedOrderItemId: group.rows[0].orderItemId, quantityLost: lostUnits / 1000, costPerUnit: cost / (lostUnits / 1000), totalCostLost: cost });
  }
  return { settlements, losses };
}
