import prisma from "../../config/prisma.js";

/**
 * Waste Reduction Repository
 *
 * Gathers loss/waste context data needed for Gemini to generate waste reduction insights.
 */

export const wasteReductionRepository = {
  /**
   * Get loss records from the last 30 days, grouped by ingredient.
   */
  async getLossRecords() {
    const rows = await prisma.$queryRawUnsafe(`
      SELECT
        i.ingredient_id,
        i.ingredient_name AS name,
        i.unit,
        ROUND(SUM(lr.quantity_lost)::numeric, 2) AS total_lost,
        COUNT(*)::int AS loss_count,
        MODE() WITHIN GROUP (ORDER BY lr.loss_type) AS primary_type,
        ROUND(SUM(lr.total_cost_lost)::numeric, 2) AS total_cost_lost
      FROM loss_records lr
      JOIN ingredients i ON i.ingredient_id = lr.ingredient_id
      WHERE lr.logged_at >= NOW() - INTERVAL '30 days'
      GROUP BY i.ingredient_id, i.ingredient_name, i.unit
      ORDER BY total_lost DESC
    `);
    return rows;
  },

  /**
   * Get current stock vs forecasted weekly usage per ingredient.
   * Joins latest forecast results with recipes.
   */
  async getStockVsForecast() {
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
        COALESCE(SUM(rb.quantity_left), 0)::float AS stock,
        COALESCE(iw.total_usage, 0)::float AS weekly_usage,
        CASE
          WHEN COALESCE(iw.total_usage, 0) > 0
          THEN ROUND((COALESCE(SUM(rb.quantity_left), 0) / iw.total_usage * 7)::numeric, 1)
          ELSE 999
        END AS days_covered
      FROM ingredients i
      LEFT JOIN restock_batches rb
        ON rb.ingredient_id = i.ingredient_id AND rb.quantity_left > 0
      LEFT JOIN (
        SELECT
          r.ingredient_id,
          SUM(daily.total)::float AS total_usage
        FROM forecast_results fr
        CROSS JOIN latest_job lj
        JOIN recipes r ON r.variant_id = fr.variant_id
        JOIN LATERAL (
          SELECT (elem->>'units')::float * r.quantity_needed AS total
          FROM jsonb_array_elements(fr.daily_data) AS elem
        ) daily ON true
        WHERE fr.job_id = lj.id AND fr.skipped = false
        GROUP BY r.ingredient_id
      ) iw ON iw.ingredient_id = i.ingredient_id
      WHERE i.is_archived = false
      GROUP BY i.ingredient_id, i.ingredient_name, i.unit, iw.total_usage
      HAVING COALESCE(SUM(rb.quantity_left), 0) > 0
      ORDER BY days_covered DESC
    `);
    return rows;
  },

  /**
   * Get recent restock history (last 30 days) to identify over-ordering patterns.
   */
  async getRestockHistory() {
    const rows = await prisma.$queryRawUnsafe(`
      SELECT
        i.ingredient_id,
        i.ingredient_name AS name,
        i.unit,
        ROUND(SUM(rb.quantity_added)::numeric, 2) AS total_restocked,
        COUNT(*)::int AS restock_count,
        ROUND(AVG(rb.quantity_added)::numeric, 2) AS avg_per_restock
      FROM restock_batches rb
      JOIN ingredients i ON i.ingredient_id = rb.ingredient_id
      WHERE rb.restocked_at >= NOW() - INTERVAL '30 days'
      GROUP BY i.ingredient_id, i.ingredient_name, i.unit
      ORDER BY total_restocked DESC
    `);
    return rows;
  },

  /**
   * Get ingredient cost data (most recent batch cost per unit).
   */
  async getIngredientCosts() {
    const rows = await prisma.$queryRawUnsafe(`
      SELECT DISTINCT ON (i.ingredient_id)
        i.ingredient_id,
        i.ingredient_name AS name,
        i.unit,
        ROUND(rb.cost_per_unit::numeric, 2) AS cost_per_unit
      FROM restock_batches rb
      JOIN ingredients i ON i.ingredient_id = rb.ingredient_id
      WHERE rb.quantity_left > 0
      ORDER BY i.ingredient_id, rb.restocked_at DESC
    `);
    return rows;
  },

  /**
   * Clear old pending insights and save new ones.
   */
  async saveInsights(insights) {
    await prisma.$transaction(async (tx) => {
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
            potentialSavings: i.potential_savings || null,
            confidence: i.confidence,
            status: "pending",
          })),
        });
      }
    });
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
    }));
  },

  /**
   * Update insight status (accept or reject).
   */
  async updateStatus(id, status) {
    return prisma.wasteReduction.update({
      where: { id },
      data: { status },
    });
  },
};
