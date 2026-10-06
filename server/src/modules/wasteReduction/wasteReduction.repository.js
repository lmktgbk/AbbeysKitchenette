import { recordEffects } from "../../infrastructure/effects/effects.js";
import { ACTIONS } from "../auditLogs/auditLog.constants.js";
import prisma from "../../config/prisma.js";

/** Persists calculated advice atomically and preserves resolved history. */

export const wasteReductionRepository = {
  // Generation finishes before this method. Replace only pending rows; resolved
  // history survives. A failed insert or lost scheduler lease rolls back replacement.
  async saveInsights(insights, automation, userId) {
    await prisma.$transaction(async (tx) => {
      // Serialize replacement even when the pending set is empty.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(73422, 2)`;
      // Delete old pending insights
      await tx.wasteReduction.deleteMany({
        where: { status: "pending" },
      });

      // Insert new insights
      if (insights.length > 0) {
        await tx.wasteReduction.createMany({
          data: insights.map((i) => ({
            ingredientId: i.ingredient_id,
            currentStock: i.current_stock,
            forecastedUsage: i.forecasted_weekly_usage,
            unit: i.unit,
            overstockAmount: i.overstock_amount,
            wasteRisk: i.waste_risk,
            reasoning: i.reasoning,
            suggestion: i.suggestion,
            potentialSavings: null,
            confidence: i.confidence,
            status: "pending",
            metadata: i.metadata,
          })),
        });
      }
      // Publish advisory data and the scheduled run outcome in the same commit.
      if (automation) await automation.complete(tx);
      else await recordEffects(tx, { audit: { userId, action: ACTIONS.WASTE_RUN,
        targetType: "wasteReduction", details: { source: "manual", count: insights.length } } });
    }, { timeout: 5000 });
  },

  /**
   * Get all pending insights with ingredient details.
   */
  async getPendingInsights() {
    const rows = await prisma.wasteReduction.findMany({
      where: { status: "pending" },
      include: {
        ingredient: {
          select: { ingredientName: true, unit: true },
        },
      },
      orderBy: [
        { wasteRisk: "asc" }, // high first
        { createdAt: "desc" },
      ],
    });

    return rows.map((r) => ({
      id: r.id,
      ingredient_id: r.ingredientId,
      ingredient_name: r.ingredient.ingredientName,
      current_stock: Number(r.currentStock),
      forecasted_weekly_usage: Number(r.forecastedUsage),
      unit: r.unit,
      overstock_amount: Number(r.overstockAmount),
      waste_risk: r.wasteRisk,
      reasoning: r.reasoning,
      suggestion: r.suggestion,
      potential_savings: r.potentialSavings ? Number(r.potentialSavings) : null,
      confidence: r.confidence,
      status: r.status,
      created_at: r.createdAt,
      metadata: r.metadata,
    }));
  },

};
