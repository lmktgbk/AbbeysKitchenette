import prisma from "../../config/prisma.js";

/**
 * Reorder Suggestions Repository
 *
 * Gathers inventory context data needed for Gemini to generate reorder recommendations.
 * All queries read-only — no writes except to the ReorderSuggestion table.
 */

export const reorderSuggestionsRepository = {
  /**
   * Get all active ingredients with current stock, threshold, and unit.
   * Stock is computed from active restock batches (SUM of quantity_left).
   */
  async getIngredientsWithStock() {
    const rows = await prisma.$queryRawUnsafe(`
      SELECT
        i.ingredient_id,
        i.ingredient_name,
        i.unit,
        i.minimum_threshold,
        COALESCE(SUM(rb.quantity_left), 0)::float AS stock
      FROM ingredients i
      LEFT JOIN restock_batches rb
        ON rb.ingredient_id = i.ingredient_id
        AND rb.quantity_left > 0
      WHERE i.is_archived = false
      GROUP BY i.ingredient_id, i.ingredient_name, i.unit, i.minimum_threshold
      ORDER BY i.ingredient_name
    `);
    return rows;
  },

  /**
   * Get forecasted ingredient demand for the next 7 days.
   * Joins the latest completed forecast results with recipes to get per-ingredient needs.
   * Returns daily_avg and total_7day per ingredient.
   */
  async getForecastedDemand() {
    const rows = await prisma.$queryRawUnsafe(`
      WITH latest_job AS (
        SELECT id FROM forecast_jobs
        WHERE status = 'completed'
        ORDER BY completed_at DESC LIMIT 1
      )
      SELECT
        i.ingredient_id,
        i.ingredient_name AS name,
        i.unit,
        ROUND(AVG(ingredient_daily.total)::numeric, 2) AS daily_avg,
        ROUND(SUM(ingredient_daily.total)::numeric, 2) AS total_7day
      FROM forecast_results fr
      CROSS JOIN latest_job lj
      JOIN recipes r ON r.variant_id = fr.variant_id
      JOIN ingredients i ON i.ingredient_id = r.ingredient_id
      JOIN LATERAL (
        SELECT (elem->>'units')::float * r.quantity_needed AS total
        FROM jsonb_array_elements(fr.daily_data) AS elem
        LIMIT 7
      ) ingredient_daily ON true
      WHERE fr.job_id = lj.id
        AND fr.skipped = false
      GROUP BY i.ingredient_id, i.ingredient_name, i.unit
      ORDER BY i.ingredient_name
    `);
    return rows;
  },

  /**
   * Get recent usage patterns (last 14 days).
   * Computes average daily consumption from stock adjustments of type "deduction".
   */
  async getUsagePatterns() {
    const rows = await prisma.$queryRawUnsafe(`
      SELECT
        i.ingredient_id,
        i.ingredient_name AS name,
        i.unit,
        ROUND(AVG(sa.quantity_changed)::numeric, 2) AS avg_daily,
        ROUND(SUM(sa.quantity_changed)::numeric, 2) AS total_14day
      FROM stock_adjustments sa
      JOIN ingredients i ON i.ingredient_id = sa.ingredient_id
      WHERE sa.adjustment_type = 'deduction'
        AND sa.adjusted_at >= NOW() - INTERVAL '14 days'
      GROUP BY i.ingredient_id, i.ingredient_name, i.unit
      HAVING SUM(sa.quantity_changed) > 0
      ORDER BY total_14day DESC
    `);
    return rows;
  },

  /**
   * Get supplier information from recent restock batches.
   * Returns the most common supplier per ingredient and restock frequency.
   */
  async getSupplierInfo() {
    const rows = await prisma.$queryRawUnsafe(`
      SELECT
        i.ingredient_id,
        i.ingredient_name AS name,
        COALESCE(rb.supplier_name, 'Unknown') AS supplier,
        COUNT(*)::int AS restock_count
      FROM restock_batches rb
      JOIN ingredients i ON i.ingredient_id = rb.ingredient_id
      WHERE rb.restocked_at >= NOW() - INTERVAL '30 days'
      GROUP BY i.ingredient_id, i.ingredient_name, rb.supplier_name
      ORDER BY i.ingredient_name, restock_count DESC
    `);
    return rows;
  },

  /**
   * Clear old pending suggestions and save new ones.
   * Uses a transaction to delete old + insert new atomically.
   */
  async saveSuggestions(suggestions) {
    await prisma.$transaction(async (tx) => {
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
          })),
        });
      }
    });
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
    }));
  },

  /**
   * Update suggestion status (accept or reject).
   */
  async updateStatus(id, status) {
    return prisma.reorderSuggestion.update({
      where: { id },
      data: { status },
    });
  },
};
