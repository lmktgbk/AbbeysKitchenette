import prisma from "../../config/prisma.js";

/**
 * Dashboard Repository
 *
 * All database queries for the admin dashboard analytics.
 * Uses $queryRawUnsafe for complex multi-table aggregations.
 */
export const dashboardRepository = {
  /**
   * Get order KPIs for a date range: total revenue, order count, average order value.
   * Excludes cancelled orders.
   * @param {string|null} dateFrom - YYYY-MM-DD or null for all time
   * @param {string|null} dateTo - YYYY-MM-DD or null for all time
   * @returns {object} - { revenue, orders, aov }
   */
  async getOrderKpis(dateFrom, dateTo) {
    const clauses = ["o.status != 'cancelled'"];
    const values = [];
    let idx = 1;

    if (dateFrom) {
      clauses.push(`o.order_date >= $${idx++}::date`);
      values.push(dateFrom);
    }
    if (dateTo) {
      clauses.push(`o.order_date <= $${idx++}::date`);
      values.push(dateTo);
    }

    const where = `WHERE ${clauses.join(" AND ")}`;
    const sql = `
      SELECT
        COALESCE(SUM(o.total_amount), 0)::float AS revenue,
        COUNT(*)::int AS orders,
        CASE
          WHEN COUNT(*) > 0
          THEN ROUND(SUM(o.total_amount) / COUNT(*)::numeric, 2)
          ELSE 0
        END AS aov
      FROM orders o
      ${where}
    `;
    const result = await prisma.$queryRawUnsafe(sql, ...values);
    return result[0] || { revenue: 0, orders: 0, aov: 0 };
  },

  /**
   * Get today's order KPIs.
   * @returns {object} - { revenue, orders, aov }
   */
  async getTodayKpis() {
    const result = await prisma.$queryRaw`
      SELECT
        COALESCE(SUM(o.total_amount), 0)::float AS revenue,
        COUNT(*)::int AS orders,
        CASE
          WHEN COUNT(*) > 0
          THEN ROUND(SUM(o.total_amount) / COUNT(*)::numeric, 2)
          ELSE 0
        END AS aov
      FROM orders o
      WHERE o.order_date = CURRENT_DATE
        AND o.status != 'cancelled'
    `;
    return result[0] || { revenue: 0, orders: 0, aov: 0 };
  },

  /**
   * Daily revenue trend for completed orders.
   * @param {string|null} dateFrom
   * @param {string|null} dateTo
   * @returns {Array<{date, revenue, orders}>}
   */
  async getDailyRevenueTrend(dateFrom, dateTo) {
    const clauses = ["o.status = 'completed'"];
    const values = [];
    let idx = 1;

    if (dateFrom) {
      clauses.push(`o.order_date >= $${idx++}::date`);
      values.push(dateFrom);
    }
    if (dateTo) {
      clauses.push(`o.order_date <= $${idx++}::date`);
      values.push(dateTo);
    }

    const where = `WHERE ${clauses.join(" AND ")}`;
    const sql = `
      SELECT
        o.order_date::date AS date,
        ROUND(SUM(o.total_amount)::numeric, 2)::float AS revenue,
        COUNT(*)::int AS orders
      FROM orders o
      ${where}
      GROUP BY o.order_date::date
      ORDER BY o.order_date::date ASC
    `;
    return prisma.$queryRawUnsafe(sql, ...values);
  },

  /**
   * Orders grouped by status.
   * @returns {object} - { pending, accepted, next_in_line, processing, completed, cancelled }
   */
  async getOrdersByStatus() {
    const result = await prisma.order.groupBy({
      by: ["status"],
      _count: { _all: true },
    });

    const counts = { pending: 0, accepted: 0, next_in_line: 0, processing: 0, completed: 0, cancelled: 0 };
    for (const row of result) {
      counts[row.status] = row._count._all;
    }
    return counts;
  },

  /**
   * Orders grouped by source (walk_in vs online).
   * @param {string|null} dateFrom
   * @param {string|null} dateTo
   * @returns {Array<{source, count}>}
   */
  async getOrdersBySource(dateFrom, dateTo) {
    const clauses = [];
    const values = [];
    let idx = 1;

    if (dateFrom) {
      clauses.push(`o.order_date >= $${idx++}::date`);
      values.push(dateFrom);
    }
    if (dateTo) {
      clauses.push(`o.order_date <= $${idx++}::date`);
      values.push(dateTo);
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const sql = `
      SELECT
        o.order_source AS source,
        COUNT(*)::int AS count
      FROM orders o
      ${where}
      GROUP BY o.order_source
    `;
    return prisma.$queryRawUnsafe(sql, ...values);
  },

  /**
   * Top selling products by revenue.
   * @param {number} limit
   * @param {string|null} dateFrom
   * @param {string|null} dateTo
   * @returns {Array<{productName, unitsSold, revenue}>}
   */
  async getTopProducts(limit = 10, dateFrom, dateTo) {
    const clauses = ["o.status = 'completed'"];
    const values = [];
    let idx = 1;

    if (dateFrom) {
      clauses.push(`o.order_date >= $${idx++}::date`);
      values.push(dateFrom);
    }
    if (dateTo) {
      clauses.push(`o.order_date <= $${idx++}::date`);
      values.push(dateTo);
    }

    values.push(limit);
    const where = `WHERE ${clauses.join(" AND ")}`;
    const sql = `
      SELECT
        p.product_name AS "productName",
        SUM(oi.quantity)::int AS "unitsSold",
        ROUND(SUM(oi.subtotal)::numeric, 2)::float AS revenue
      FROM order_items oi
      JOIN products p ON p.product_id = oi.product_id
      JOIN orders o ON o.order_id = oi.order_id
      ${where}
      GROUP BY p.product_name
      ORDER BY revenue DESC
      LIMIT $${idx}
    `;
    return prisma.$queryRawUnsafe(sql, ...values);
  },

  /**
   * Top selling variants by revenue.
   * @param {number} limit
   * @param {string|null} dateFrom
   * @param {string|null} dateTo
   * @returns {Array<{productName, sizeName, unitsSold, revenue}>}
   */
  async getTopVariants(limit = 10, dateFrom, dateTo) {
    const clauses = ["o.status = 'completed'"];
    const values = [];
    let idx = 1;

    if (dateFrom) {
      clauses.push(`o.order_date >= $${idx++}::date`);
      values.push(dateFrom);
    }
    if (dateTo) {
      clauses.push(`o.order_date <= $${idx++}::date`);
      values.push(dateTo);
    }

    values.push(limit);
    const where = `WHERE ${clauses.join(" AND ")}`;
    const sql = `
      SELECT
        p.product_name AS "productName",
        pv.size_name AS "sizeName",
        SUM(oi.quantity)::int AS "unitsSold",
        ROUND(SUM(oi.subtotal)::numeric, 2)::float AS revenue
      FROM order_items oi
      JOIN products p ON p.product_id = oi.product_id
      JOIN product_variants pv ON pv.variant_id = oi.variant_id
      JOIN orders o ON o.order_id = oi.order_id
      ${where}
      GROUP BY p.product_name, pv.size_name
      ORDER BY revenue DESC
      LIMIT $${idx}
    `;
    return prisma.$queryRawUnsafe(sql, ...values);
  },

  /**
   * Sales grouped by category.
   * @param {string|null} dateFrom
   * @param {string|null} dateTo
   * @returns {Array<{categoryName, revenue, orderCount}>}
   */
  async getSalesByCategory(dateFrom, dateTo) {
    const clauses = ["o.status = 'completed'"];
    const values = [];
    let idx = 1;

    if (dateFrom) {
      clauses.push(`o.order_date >= $${idx++}::date`);
      values.push(dateFrom);
    }
    if (dateTo) {
      clauses.push(`o.order_date <= $${idx++}::date`);
      values.push(dateTo);
    }

    const where = `WHERE ${clauses.join(" AND ")}`;
    const sql = `
      SELECT
        c.category_name AS "categoryName",
        ROUND(SUM(oi.subtotal)::numeric, 2)::float AS revenue,
        COUNT(DISTINCT o.order_id)::int AS "orderCount"
      FROM order_items oi
      JOIN products p ON p.product_id = oi.product_id
      JOIN categories c ON c.category_id = p.category_id
      JOIN orders o ON o.order_id = oi.order_id
      ${where}
      GROUP BY c.category_name
      ORDER BY revenue DESC
    `;
    return prisma.$queryRawUnsafe(sql, ...values);
  },

  /**
   * Variant-level performance with margin calculation.
   * @param {string|null} productId - filter by product, or null for all
   * @param {string|null} dateFrom
   * @param {string|null} dateTo
   * @returns {Array}
   */
  async getVariantPerformance(productId, dateFrom, dateTo) {
    const clauses = ["o.status = 'completed'"];
    const values = [];
    let idx = 1;

    if (dateFrom) {
      clauses.push(`o.order_date >= $${idx++}::date`);
      values.push(dateFrom);
    }
    if (dateTo) {
      clauses.push(`o.order_date <= $${idx++}::date`);
      values.push(dateTo);
    }
    if (productId) {
      clauses.push(`p.product_id = $${idx++}::uuid`);
      values.push(productId);
    }

    const where = `WHERE ${clauses.join(" AND ")}`;
    const sql = `
      WITH variant_sales AS (
        SELECT
          pv.variant_id AS "variantId",
          p.product_name AS "productName",
          pv.size_name AS "sizeName",
          pv.price,
          SUM(oi.quantity)::int AS "unitsSold",
          ROUND(SUM(oi.subtotal)::numeric, 2)::float AS revenue
        FROM order_items oi
        JOIN products p ON p.product_id = oi.product_id
        JOIN product_variants pv ON pv.variant_id = oi.variant_id
        JOIN orders o ON o.order_id = oi.order_id
        ${where}
        GROUP BY pv.variant_id, p.product_name, pv.size_name, pv.price
      ),
      variant_costs AS (
        SELECT
          r.variant_id,
          SUM(r.quantity_needed * rb.cost_per_unit)::float AS total_cost
        FROM recipes r
        JOIN restock_batches rb ON rb.ingredient_id = r.ingredient_id
          AND rb.quantity_left > 0
        GROUP BY r.variant_id
      )
      SELECT
        vs.*,
        COALESCE(vc.total_cost, 0) AS cost,
        CASE
          WHEN vs.revenue > 0 AND COALESCE(vc.total_cost, 0) > 0
          THEN ROUND(((vs.revenue - vc.total_cost) / vs.revenue * 100)::numeric, 1)
          ELSE 0
        END AS margin
      FROM variant_sales vs
      LEFT JOIN variant_costs vc ON vc.variant_id = vs."variantId"
      ORDER BY vs.revenue DESC
    `;
    return prisma.$queryRawUnsafe(sql, ...values);
  },

  /**
   * Ingredient stock status counts.
   * @returns {object} - { total, healthy, low, out }
   */
  async getIngredientStockStatus() {
    const stockExpr = "(SELECT COALESCE(SUM(rb.quantity_left), 0) FROM restock_batches rb WHERE rb.ingredient_id = i.ingredient_id AND rb.quantity_left > 0)";
    const result = await prisma.$queryRawUnsafe(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE ${stockExpr} > i.minimum_threshold)::int AS healthy,
        COUNT(*) FILTER (WHERE ${stockExpr} > 0 AND ${stockExpr} <= i.minimum_threshold)::int AS low,
        COUNT(*) FILTER (WHERE ${stockExpr} <= 0)::int AS out
      FROM ingredients i
      WHERE i.is_archived = false
    `);
    return result[0] || { total: 0, healthy: 0, low: 0, out: 0 };
  },

  /**
   * Ingredients below their minimum threshold.
   * @returns {Array<{name, stock, threshold, unit}>}
   */
  async getLowStockIngredients() {
    const stockExpr = "(SELECT COALESCE(SUM(rb.quantity_left), 0) FROM restock_batches rb WHERE rb.ingredient_id = i.ingredient_id AND rb.quantity_left > 0)";
    return prisma.$queryRawUnsafe(`
      SELECT
        i.ingredient_name AS name,
        ROUND((${stockExpr})::numeric, 2)::float AS stock,
        i.minimum_threshold AS threshold,
        i.unit
      FROM ingredients i
      WHERE i.is_archived = false
        AND ${stockExpr} <= i.minimum_threshold
      ORDER BY ${stockExpr} ASC
    `);
  },

  /**
   * Top ingredients by total cost (from restock batches).
   * @param {number} limit
   * @returns {Array<{name, totalCost, unit}>}
   */
  async getIngredientCosts(limit = 10) {
    return prisma.$queryRawUnsafe(`
      SELECT
        i.ingredient_name AS name,
        ROUND(SUM(rb.quantity_added * rb.cost_per_unit)::numeric, 2)::float AS "totalCost",
        i.unit
      FROM restock_batches rb
      JOIN ingredients i ON i.ingredient_id = rb.ingredient_id
      WHERE i.is_archived = false
      GROUP BY i.ingredient_name, i.unit
      ORDER BY "totalCost" DESC
      LIMIT $1
    `, limit);
  },

  /**
   * Stock vs forecasted weekly usage per ingredient.
   * @returns {Array<{name, stock, weeklyUsage, daysCovered, unit}>}
   */
  async getStockVsForecast() {
    return prisma.$queryRawUnsafe(`
      WITH latest_job AS (
        SELECT id FROM forecast_jobs
        WHERE status = 'completed'
        ORDER BY completed_at DESC LIMIT 1
      )
      SELECT
        i.ingredient_name AS name,
        COALESCE(SUM(rb.quantity_left), 0)::float AS stock,
        COALESCE(iw.total_usage, 0)::float AS "weeklyUsage",
        CASE
          WHEN COALESCE(iw.total_usage, 0) > 0
          THEN ROUND((COALESCE(SUM(rb.quantity_left), 0) / iw.total_usage * 7)::numeric, 1)
          ELSE 999
        END AS "daysCovered",
        i.unit
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
      GROUP BY i.ingredient_name, i.unit, iw.total_usage
      HAVING COALESCE(SUM(rb.quantity_left), 0) > 0
      ORDER BY "daysCovered" ASC
    `);
  },

  /**
   * Orders grouped by hour of day.
   */
  async getOrdersByHour(dateFrom, dateTo) {
    const clauses = ["o.status != 'cancelled'"];
    const values = [];
    let idx = 1;

    if (dateFrom) {
      clauses.push(`o.order_date >= $${idx++}::date`);
      values.push(dateFrom);
    }
    if (dateTo) {
      clauses.push(`o.order_date <= $${idx++}::date`);
      values.push(dateTo);
    }

    const where = `WHERE ${clauses.join(" AND ")}`;
    return prisma.$queryRawUnsafe(`
      SELECT
        EXTRACT(HOUR FROM o.created_at)::int AS hour,
        COUNT(*)::int AS orders,
        ROUND(SUM(o.total_amount)::numeric, 2)::float AS revenue
      FROM orders o
      ${where}
      GROUP BY EXTRACT(HOUR FROM o.created_at)
      ORDER BY hour ASC
    `, ...values);
  },

  /**
   * Orders grouped by day of week (0=Sunday .. 6=Saturday).
   */
  async getOrdersByDayOfWeek(dateFrom, dateTo) {
    const clauses = ["o.status != 'cancelled'"];
    const values = [];
    let idx = 1;

    if (dateFrom) {
      clauses.push(`o.order_date >= $${idx++}::date`);
      values.push(dateFrom);
    }
    if (dateTo) {
      clauses.push(`o.order_date <= $${idx++}::date`);
      values.push(dateTo);
    }

    const where = `WHERE ${clauses.join(" AND ")}`;
    return prisma.$queryRawUnsafe(`
      SELECT
        EXTRACT(DOW FROM o.order_date)::int AS day,
        CASE EXTRACT(DOW FROM o.order_date)::int
          WHEN 0 THEN 'Sun' WHEN 1 THEN 'Mon' WHEN 2 THEN 'Tue'
          WHEN 3 THEN 'Wed' WHEN 4 THEN 'Thu' WHEN 5 THEN 'Fri' WHEN 6 THEN 'Sat'
        END AS "dayName",
        COUNT(*)::int AS orders,
        ROUND(SUM(o.total_amount)::numeric, 2)::float AS revenue
      FROM orders o
      ${where}
      GROUP BY EXTRACT(DOW FROM o.order_date)
      ORDER BY day ASC
    `, ...values);
  },

  /**
   * Cancellation reasons breakdown.
   */
  async getCancellationReasons(dateFrom, dateTo) {
    const clauses = [];
    const values = [];
    let idx = 1;

    if (dateFrom) {
      clauses.push(`oc.cancelled_at >= $${idx++}::date`);
      values.push(dateFrom);
    }
    if (dateTo) {
      clauses.push(`oc.cancelled_at <= ($${idx++}::date + INTERVAL '1 day')`);
      values.push(dateTo);
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    return prisma.$queryRawUnsafe(`
      SELECT
        COALESCE(oc.reason, 'No reason') AS reason,
        COUNT(*)::int AS count
      FROM order_cancellations oc
      ${where}
      GROUP BY oc.reason
      ORDER BY count DESC
    `, ...values);
  },

  /**
   * Average order fulfillment time in minutes for completed orders.
   */
  async getFulfillmentTime(dateFrom, dateTo) {
    const clauses = ["o.status = 'completed'", "o.completed_at IS NOT NULL"];
    const values = [];
    let idx = 1;

    if (dateFrom) {
      clauses.push(`o.order_date >= $${idx++}::date`);
      values.push(dateFrom);
    }
    if (dateTo) {
      clauses.push(`o.order_date <= $${idx++}::date`);
      values.push(dateTo);
    }

    const where = `WHERE ${clauses.join(" AND ")}`;
    const result = await prisma.$queryRawUnsafe(`
      WITH times AS (
        SELECT EXTRACT(EPOCH FROM (o.completed_at - o.created_at)) / 60 AS minutes
        FROM orders o
        ${where}
      )
      SELECT
        ROUND(AVG(minutes)::numeric, 1)::float AS "avgMinutes",
        ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY minutes)::numeric, 1)::float AS "medianMinutes",
        COUNT(*)::int AS count
      FROM times
    `, ...values);
    return result[0] || { avgMinutes: 0, medianMinutes: 0, count: 0 };
  },

  /**
   * Table utilization — orders and revenue per table.
   */
  async getTableUtilization(dateFrom, dateTo) {
    const clauses = ["o.status != 'cancelled'"];
    const values = [];
    let idx = 1;

    if (dateFrom) {
      clauses.push(`o.order_date >= $${idx++}::date`);
      values.push(dateFrom);
    }
    if (dateTo) {
      clauses.push(`o.order_date <= $${idx++}::date`);
      values.push(dateTo);
    }

    const where = `WHERE ${clauses.join(" AND ")}`;
    return prisma.$queryRawUnsafe(`
      SELECT
        COALESCE(o.table_number, 'Takeout') AS "table",
        COUNT(*)::int AS orders,
        ROUND(SUM(o.total_amount)::numeric, 2)::float AS revenue
      FROM orders o
      ${where}
      GROUP BY o.table_number
      ORDER BY revenue DESC
    `, ...values);
  },

  /**
   * Staff performance — orders processed and revenue per user.
   */
  async getStaffPerformance(dateFrom, dateTo) {
    const clauses = ["o.status = 'completed'", "o.created_by IS NOT NULL"];
    const values = [];
    let idx = 1;

    if (dateFrom) {
      clauses.push(`o.order_date >= $${idx++}::date`);
      values.push(dateFrom);
    }
    if (dateTo) {
      clauses.push(`o.order_date <= $${idx++}::date`);
      values.push(dateTo);
    }

    const where = `WHERE ${clauses.join(" AND ")}`;
    return prisma.$queryRawUnsafe(`
      SELECT
        u.name,
        u.role,
        COUNT(*)::int AS orders,
        ROUND(SUM(o.total_amount)::numeric, 2)::float AS revenue
      FROM orders o
      JOIN "User" u ON u.id = o.created_by
      ${where}
      GROUP BY u.id, u.name, u.role
      ORDER BY revenue DESC
    `, ...values);
  },

  /**
   * Top combo pairs from MBA rules.
   */
  async getTopCombos(limit = 5) {
    return prisma.$queryRawUnsafe(`
      SELECT
        product_name_a AS "productA",
        product_name_b AS "productB",
        support,
        confidence,
        lift,
        is_combo AS "isCombo"
      FROM mba_rules
      ORDER BY lift DESC
      LIMIT $1
    `, limit);
  },

  /**
   * Previous period KPIs for comparison (same duration, shifted back).
   */
  async getPreviousPeriodKpis(dateFrom, dateTo) {
    if (!dateFrom || !dateTo) {
      return { revenue: 0, orders: 0, aov: 0 };
    }
    const result = await prisma.$queryRawUnsafe(`
      SELECT
        COALESCE(SUM(o.total_amount), 0)::float AS revenue,
        COUNT(*)::int AS orders,
        CASE
          WHEN COUNT(*) > 0
          THEN ROUND(SUM(o.total_amount) / COUNT(*)::numeric, 2)
          ELSE 0
        END AS aov
      FROM orders o
      WHERE o.status != 'cancelled'
        AND o.order_date >= ($1::date - ($2::date - $1::date))
        AND o.order_date < $1::date
    `, dateFrom, dateTo);
    return result[0] || { revenue: 0, orders: 0, aov: 0 };
  },

  /**
   * Cost of Goods Sold for a period — sum of restock costs consumed.
   */
  async getCOGS(dateFrom, dateTo) {
    const clauses = ["o.status = 'completed'"];
    const values = [];
    let idx = 1;

    if (dateFrom) {
      clauses.push(`o.order_date >= $${idx++}::date`);
      values.push(dateFrom);
    }
    if (dateTo) {
      clauses.push(`o.order_date <= $${idx++}::date`);
      values.push(dateTo);
    }

    const where = `WHERE ${clauses.join(" AND ")}`;
    const result = await prisma.$queryRawUnsafe(`
      WITH order_costs AS (
        SELECT
          oi.order_id,
          oi.variant_id,
          oi.quantity AS units_sold,
          COALESCE(SUM(r.quantity_needed * rb.cost_per_unit), 0) AS cost_per_unit
        FROM order_items oi
        JOIN orders o ON o.order_id = oi.order_id
        LEFT JOIN recipes r ON r.variant_id = oi.variant_id
        LEFT JOIN restock_batches rb ON rb.ingredient_id = r.ingredient_id AND rb.quantity_left > 0
        ${where}
        GROUP BY oi.order_id, oi.variant_id, oi.quantity
      )
      SELECT
        COALESCE(SUM(units_sold * cost_per_unit), 0)::float AS cogs
      FROM order_costs
    `, ...values);
    return result[0]?.cogs || 0;
  },

  /**
   * Cancellation rate as a percentage.
   */
  async getCancellationRate(dateFrom, dateTo) {
    const clauses = [];
    const values = [];
    let idx = 1;

    if (dateFrom) {
      clauses.push(`o.order_date >= $${idx++}::date`);
      values.push(dateFrom);
    }
    if (dateTo) {
      clauses.push(`o.order_date <= $${idx++}::date`);
      values.push(dateTo);
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const result = await prisma.$queryRawUnsafe(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE o.status = 'cancelled')::int AS cancelled
      FROM orders o
      ${where}
    `, ...values);
    const row = result[0] || { total: 0, cancelled: 0 };
    return {
      rate: row.total > 0 ? Math.round((row.cancelled / row.total) * 1000) / 10 : 0,
      cancelled: row.cancelled,
      total: row.total,
    };
  },

  /**
   * Profit = Revenue - COGS for a period.
   */
  async getProfit(dateFrom, dateTo) {
    const revenueResult = await this.getOrderKpis(dateFrom, dateTo);
    const cogs = await this.getCOGS(dateFrom, dateTo);
    const revenue = revenueResult.revenue || 0;
    const profit = revenue - cogs;
    const margin = revenue > 0 ? Math.round((profit / revenue) * 1000) / 10 : 0;
    return { profit, margin };
  },
};
