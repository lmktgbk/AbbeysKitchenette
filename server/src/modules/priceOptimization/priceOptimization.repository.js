import prisma from "../../config/prisma.js";

/**
 * Price Optimization Repository
 *
 * Raw SQL queries to gather pricing context for Gemini.
 * Uses $queryRawUnsafe for complex multi-table joins.
 */
const priceOptimizationRepository = {
  /**
   * Get variant pricing context: current price, COGS, margin, sales volume, trend.
   * Joins ProductVariant → Recipe → RestockBatch (FIFO cost) and aggregates sales.
   */
  async getVariantPricingContext(productId) {
    return prisma.$queryRawUnsafe(`
      WITH variant_costs AS (
        SELECT
          r.variant_id,
          SUM(r.quantity_needed * rb.cost_per_unit) AS total_cog
        FROM recipes r
        JOIN restock_batches rb ON rb.ingredient_id = r.ingredient_id
          AND rb.quantity_left > 0
        GROUP BY r.variant_id
      ),
      variant_sales AS (
        SELECT
          oi.variant_id,
          COUNT(*) AS total_units,
          COALESCE(SUM(oi.subtotal), 0) AS total_revenue
        FROM order_items oi
        JOIN orders o ON o.order_id = oi.order_id
        WHERE o.status = 'completed'
          AND o.order_date >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY oi.variant_id
      ),
      forecast_trends AS (
        SELECT DISTINCT ON (fr.variant_id)
          fr.variant_id,
          fr.trend
        FROM forecast_results fr
        ORDER BY fr.variant_id, fr.id DESC
      )
      SELECT
        pv.variant_id AS variant_id,
        p.product_name,
        pv.size_name,
        pv.price AS price,
        COALESCE(vc.total_cog, 0) AS cost_per_unit,
        CASE
          WHEN pv.price > 0 AND COALESCE(vc.total_cog, 0) > 0
          THEN ROUND(((pv.price - vc.total_cog) / pv.price * 100)::numeric, 1)
          ELSE 0
        END AS margin_percent,
        COALESCE(vs.total_units, 0)::int AS total_units_sold,
        COALESCE(vs.total_revenue, 0) AS total_revenue,
        COALESCE(ft.trend, 'stable') AS trend
      FROM product_variants pv
      JOIN products p ON p.product_id = pv.product_id
      LEFT JOIN variant_costs vc ON vc.variant_id = pv.variant_id
      LEFT JOIN variant_sales vs ON vs.variant_id = pv.variant_id
      LEFT JOIN forecast_trends ft ON ft.variant_id = pv.variant_id
      WHERE pv.product_id = $1
      ORDER BY pv.size_name
    `, productId);
  },

  /**
   * Get recipe details for a product's variants.
   */
  async getRecipeDetails(productId) {
    return prisma.$queryRawUnsafe(`
      SELECT
        r.variant_id,
        p.product_name,
        pv.size_name,
        i.ingredient_name,
        r.quantity_needed,
        i.unit,
        COALESCE(
          (SELECT rb.cost_per_unit
           FROM restock_batches rb
           WHERE rb.ingredient_id = r.ingredient_id AND rb.quantity_left > 0
           ORDER BY rb.restocked_at DESC LIMIT 1),
          0
        ) AS cost_per_unit,
        ROUND((r.quantity_needed * COALESCE(
          (SELECT rb.cost_per_unit
           FROM restock_batches rb
           WHERE rb.ingredient_id = r.ingredient_id AND rb.quantity_left > 0
           ORDER BY rb.restocked_at DESC LIMIT 1),
          0
        ))::numeric, 2) AS line_cost
      FROM recipes r
      JOIN product_variants pv ON pv.variant_id = r.variant_id
      JOIN products p ON p.product_id = pv.product_id
      JOIN ingredients i ON i.ingredient_id = r.ingredient_id
      WHERE pv.product_id = $1
      ORDER BY pv.size_name, i.ingredient_name
    `, productId);
  },

  /**
   * Get product basic info.
   */
  async getProductInfo(productId) {
    return prisma.product.findUnique({
      where: { productId },
      include: { category: true },
    });
  },

  /**
   * Save optimization suggestions to DB.
   * Deletes any existing pending suggestions for the product's variants first
   * to prevent duplicates after regeneration.
   */
  async saveSuggestions(suggestions, productId) {
    if (productId) {
      await prisma.priceOptimization.deleteMany({
        where: {
          status: "pending",
          variant: { productId },
        },
      });
    }
    return prisma.priceOptimization.createMany({ data: suggestions });
  },

  /**
   * Get pending suggestions for a product (or all).
   */
  async getPendingSuggestions(productId) {
    const where = { status: "pending" };
    if (productId) {
      where.variant = { productId };
    }
    return prisma.priceOptimization.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
  },

  /**
   * Update suggestion status.
   */
  async updateStatus(id, status) {
    return prisma.priceOptimization.update({
      where: { id },
      data: { status },
    });
  },

  /**
   * Update variant price.
   */
  async updateVariantPrice(variantId, price) {
    return prisma.productVariant.update({
      where: { variantId },
      data: { price },
    });
  },
};

export default priceOptimizationRepository;
