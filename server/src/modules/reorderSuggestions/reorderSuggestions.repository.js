import { recordEffects } from "../../infrastructure/effects/effects.js";
import { ACTIONS } from "../auditLogs/auditLog.constants.js";
import prisma from "../../config/prisma.js";
import { readInventoryPlanningSnapshot } from "../../services/inventoryPlanning.repository.js";
import { resolveAdvisory } from "../../services/advisoryEffects.js";
import { buildReorderContexts, reorderStaleness, reorderReviewReasons } from "./reorderSuggestions.analysis.js";
import { AppError } from "../../middleware/errorHandler.middleware.js";

/** Persists calculated advice atomically and preserves resolved history. */

export const reorderSuggestionsRepository = {
  /** Called under the restock ingredient lock, before new stock changes the evidence. */
  async acceptDelivery(tx, id, ingredientId, userId) {
    const row = await tx.reorderSuggestion.findUnique({ where: { id } });
    if (!row || row.ingredientId !== ingredientId) throw new AppError(404, "Recommendation not found for this ingredient", "SUGGESTION_NOT_FOUND");
    if (row.status !== "pending") throw new AppError(409, "Recommendation already resolved. Refresh before trying again", "SUGGESTION_CONFLICT");
    const snapshot = await readInventoryPlanningSnapshot(tx);
    const context = buildReorderContexts(snapshot).find(c => c.ingredient_id === ingredientId);
    const stale = reorderStaleness(row, context);
    if (stale) throw new AppError(409, stale, "STALE_REORDER_SUGGESTION");
    if (Number(row.suggestedQuantity) <= 0 || !reorderReviewReasons(context).length)
      throw new AppError(409, "This ingredient no longer requires reorder review", "REORDER_NOT_NEEDED");
    const claimed = await tx.reorderSuggestion.updateMany({ where: { id, status: "pending" }, data: { status: "accepted" } });
    if (!claimed.count) throw new AppError(409, "Recommendation already resolved", "SUGGESTION_CONFLICT");
    await recordEffects(tx, { audit: { userId, action: ACTIONS.REORDER_ACCEPTED, targetType: "ingredient", targetId: ingredientId,
      details: { suggestionId: id, source: "restock_delivery", suggested_quantity: Number(row.suggestedQuantity), unit: row.unit } } });
  },
  async acceptCurrent(id, userId) {
    return resolveAdvisory("reorderSuggestion", id, "accepted", userId, ACTIONS.REORDER_ACCEPTED, async (tx, row) => {
      // Inventory writers use the same ingredient lock. Validation and intent commit together.
      await tx.$queryRaw`SELECT ingredient_id FROM ingredients WHERE ingredient_id=${row.ingredientId}::uuid FOR UPDATE`;
      const snapshot = await readInventoryPlanningSnapshot(tx);
      const context = buildReorderContexts(snapshot).find(c => c.ingredient_id === row.ingredientId);
      const stale = reorderStaleness(row, context);
      if (stale) throw new AppError(409, stale, "STALE_REORDER_SUGGESTION");
      if (Number(row.suggestedQuantity) <= 0 || !reorderReviewReasons(context).length) {
        throw new AppError(409, "This ingredient no longer requires a reorder review. Generate new suggestions", "REORDER_NOT_NEEDED");
      }
    });
  },
  // Generation finishes before this method. Replace only pending rows; resolved
  // history survives. A failed insert or lost scheduler lease rolls back replacement.
  async saveSuggestions(suggestions, automation, userId) {
    await prisma.$transaction(async (tx) => {
      // Serialize replacement even when the pending set is empty.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(73422, 1)`;
      // Delete old pending suggestions
      await tx.reorderSuggestion.deleteMany({
        where: { status: "pending" },
      });

      // Insert new suggestions
      if (suggestions.length > 0) {
        await tx.reorderSuggestion.createMany({
          data: suggestions.map((s) => ({
            ingredientId: s.ingredient_id,
            currentStock: s.current_stock,
            unit: s.unit,
            suggestedQuantity: s.suggested_quantity,
            urgency: s.urgency,
            reasoning: s.reasoning,
            estimatedStockout: s.estimated_stockout
              ? new Date(s.estimated_stockout)
              : null,
            confidence: s.confidence,
            status: "pending",
            metadata: s.metadata,
          })),
        });
      }
      // Publish advisory data and the scheduled run outcome in the same commit.
      if (automation) await automation.complete(tx);
      else await recordEffects(tx, { audit: { userId, action: ACTIONS.REORDER_RUN,
        targetType: "reorderSuggestions", details: { source: "manual", count: suggestions.length } } });
    }, { timeout: 5000 });
  },

  /**
   * Get all pending suggestions with ingredient details.
   */
  async getPendingSuggestions() {
    const rows = await prisma.reorderSuggestion.findMany({
      where: { status: "pending" },
      include: {
        ingredient: {
          select: { ingredientName: true, unit: true },
        },
      },
      orderBy: [
        { urgency: "asc" }, // high first
        { createdAt: "desc" },
      ],
    });

    return rows.map((r) => ({
      id: r.id,
      ingredient_id: r.ingredientId,
      ingredient_name: r.ingredient.ingredientName,
      current_stock: Number(r.currentStock),
      unit: r.unit,
      suggested_quantity: Number(r.suggestedQuantity),
      urgency: r.urgency,
      reasoning: r.reasoning,
      estimated_stockout: r.estimatedStockout,
      confidence: r.confidence,
      status: r.status,
      created_at: r.createdAt,
      metadata: r.metadata,
    }));
  },

};
