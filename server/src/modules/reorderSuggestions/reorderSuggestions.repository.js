import { recordEffects } from "../../infrastructure/effects/effects.js";
import { ACTIONS } from "../auditLogs/auditLog.constants.js";
import prisma from "../../config/prisma.js";

/** Persists calculated advice atomically and preserves resolved history. */

export const reorderSuggestionsRepository = {
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
