import prisma from "../../config/prisma.js";

/**
 * Dashboard Repository
 *
 * All database queries for the admin dashboard analytics.
 * Uses $queryRawUnsafe for complex multi-table aggregations.
 */
export const dashboardRepository = {
  /**
   * Get order KPIs for a date range: revenue, order count, average order value.
   * Revenue uses only completed orders. Orders count includes all statuses.
   * AOV = revenue / completed orders.
   * @param {string|null} dateFrom - YYYY-MM-DD or null for all time
   * @param {string|null} dateTo - YYYY-MM-DD or null for all time
   * @returns {object} - { revenue, orders, aov }
   */
  async getOrderKpis(dateFrom, dateTo) {
    const values = [];
    let idx = 1;

    if (dateFrom) {
      values.push(dateFrom);
    }
    if (dateTo) {
      values.push(dateTo);
    }

    const dateClauses = [];
    if (dateFrom) dateClauses.push(`o.order_date >= $${idx++}::date`);
    if (dateTo) dateClauses.push(`o.order_date <= $${idx++}::date`);
    const dateWhere = dateClauses.length ? `WHERE ${dateClauses.join(" AND ")}` : '';

    const sql = `
      SELECT
        COALESCE(SUM(CASE WHEN o.status = 'completed' THEN o.total_amount END), 0)::float AS revenue,
        COUNT(*)::int AS orders,
        COUNT(*) FILTER (WHERE o.status = 'completed')::int AS completed_orders
      FROM orders o
      ${dateWhere}
    `;
    const result = await prisma.$queryRawUnsafe(sql, ...values);
    const row = result[0] || { revenue: 0, orders: 0, completed_orders: 0 };
    const aov = row.completed_orders > 0 ? Math.round((row.revenue / row.completed_orders) * 100) / 100 : 0;
    return { revenue: row.revenue, orders: row.orders, aov };
  },

  /**
   * Get today's order KPIs.
   * @returns {object} - { revenue, orders, aov }
   */
  async getTodayKpis() {
    const result = await prisma.$queryRaw`
      SELECT
        COALESCE(SUM(CASE WHEN o.status = 'completed' THEN o.total_amount END), 0)::float AS revenue,
        COUNT(*)::int AS orders,
        COUNT(*) FILTER (WHERE o.status = 'completed')::int AS completed_orders
      FROM orders o
      WHERE o.order_date = CURRENT_DATE
    `;
    const row = result[0] || { revenue: 0, orders: 0, completed_orders: 0 };
    const aov = row.completed_orders > 0 ? Math.round((row.revenue / row.completed_orders) * 100) / 100 : 0;
    return { revenue: row.revenue, orders: row.orders, aov };
  },

  /**
   * Revenue trend grouped by day, week, or month.
   * @param {string|null} dateFrom
   * @param {string|null} dateTo
   * @param {string} granularity - 'daily' | 'weekly' | 'monthly'
   * @returns {Array<{date, revenue, orders}>}
   */
  async getRevenueTrend(dateFrom, dateTo, granularity = "daily") {
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

    const trunc =
      granularity === "monthly"
        ? "month"
        : granularity === "weekly"
          ? "week"
          : "day";

    const where = `WHERE ${clauses.join(" AND ")}`;
    const sql = `
      SELECT
        date_trunc('${trunc}', o.order_date)::date AS date,
        ROUND(SUM(o.total_amount)::numeric, 2)::float AS revenue,
        COUNT(*)::int AS orders
      FROM orders o
      ${where}
      GROUP BY date_trunc('${trunc}', o.order_date)::date
      ORDER BY date_trunc('${trunc}', o.order_date)::date ASC
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

    const counts = { pending: 0, accepted: 0, preparing: 0, completed: 0, cancelled: 0 };
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
      AND oi.removed_at IS NULL
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
      AND oi.removed_at IS NULL
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
        sc.subcategory_name AS "categoryName",
        ROUND(SUM(oi.subtotal)::numeric, 2)::float AS revenue,
        COUNT(DISTINCT o.order_id)::int AS "orderCount"
      FROM order_items oi
      JOIN products p ON p.product_id = oi.product_id
      JOIN subcategories sc ON sc.subcategory_id = p.subcategory_id
      JOIN orders o ON o.order_id = oi.order_id
      AND oi.removed_at IS NULL
      ${where}
      GROUP BY sc.subcategory_name
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
        AND oi.removed_at IS NULL
        ${where}
        GROUP BY pv.variant_id, p.product_name, pv.size_name, pv.price
      ),
      variant_costs AS (
        SELECT
          r.variant_id,
          SUM(r.quantity_needed * ac.avg_cost_per_unit)::float AS total_cost
        FROM recipes r
        LEFT JOIN (
          SELECT
            ingredient_id,
            CASE WHEN SUM(quantity_added) > 0
              THEN SUM(quantity_added * cost_per_unit) / SUM(quantity_added)
              ELSE 0
            END AS avg_cost_per_unit
          FROM restock_batches
          GROUP BY ingredient_id
        ) ac ON ac.ingredient_id = r.ingredient_id
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
        CASE
          WHEN oc.reason IS NULL THEN 'other'
          WHEN oc.reason IN ('customer_changed_mind', 'wrong_order', 'duplicate', 'out_of_stock', 'all_items_removed', 'other')
          THEN oc.reason
          ELSE 'other'
        END AS reason,
        COUNT(*)::int AS count
      FROM order_cancellations oc
      ${where}
      GROUP BY reason
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
   * Previous period KPIs for comparison (same duration, shifted back).
   */
  async getPreviousPeriodKpis(dateFrom, dateTo) {
    if (!dateFrom || !dateTo) {
      return { revenue: 0, orders: 0, aov: 0 };
    }
    const result = await prisma.$queryRawUnsafe(`
      SELECT
        COALESCE(SUM(CASE WHEN o.status = 'completed' THEN o.total_amount END), 0)::float AS revenue,
        COUNT(*)::int AS orders,
        COUNT(*) FILTER (WHERE o.status = 'completed')::int AS completed_orders
      FROM orders o
      WHERE o.order_date >= ($1::date - ($2::date - $1::date))
        AND o.order_date < $1::date
    `, dateFrom, dateTo);
    const row = result[0] || { revenue: 0, orders: 0, completed_orders: 0 };
    const aov = row.completed_orders > 0 ? Math.round((row.revenue / row.completed_orders) * 100) / 100 : 0;
    return { revenue: row.revenue, orders: row.orders, aov };
  },

  /**
   * Cost of Goods Sold for a period — sum of restock costs consumed.
   */
  async getCOGS(dateFrom, dateTo) {
    const clauses = ["o.status = 'completed'", "oi.removed_at IS NULL"];
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
      WITH avg_costs AS (
        SELECT
          ingredient_id,
          CASE WHEN SUM(quantity_added) > 0
            THEN SUM(quantity_added * cost_per_unit) / SUM(quantity_added)
            ELSE 0
          END AS avg_cost_per_unit
        FROM restock_batches
        GROUP BY ingredient_id
      )
      SELECT
        COALESCE(SUM(oi.quantity * r.quantity_needed * ac.avg_cost_per_unit), 0)::float AS cogs
      FROM order_items oi
      JOIN orders o ON o.order_id = oi.order_id
      LEFT JOIN recipes r ON r.variant_id = oi.variant_id
      LEFT JOIN avg_costs ac ON ac.ingredient_id = r.ingredient_id
      ${where}
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
   * Least selling products by revenue (bottom N).
   * @param {number} limit
   * @param {string|null} dateFrom
   * @param {string|null} dateTo
   * @returns {Array<{productName, unitsSold, revenue}>}
   */
  async getLeastProducts(limit = 10, dateFrom, dateTo) {
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

    const dateFilter = clauses.length > 0 ? `AND ${clauses.join(" AND ")}` : "";
    values.push(limit);
    const sql = `
      SELECT
        p.product_name AS "productName",
        COALESCE(SUM(oi.quantity), 0)::int AS "unitsSold",
        COALESCE(ROUND(SUM(oi.subtotal)::numeric, 2), 0)::float AS revenue
      FROM products p
      LEFT JOIN order_items oi
        ON oi.product_id = p.product_id
        AND oi.removed_at IS NULL
        AND EXISTS (
          SELECT 1 FROM orders o
          WHERE o.order_id = oi.order_id ${dateFilter}
        )
      WHERE p.is_archived = false
      GROUP BY p.product_name
      ORDER BY revenue ASC, "unitsSold" ASC
      LIMIT $${idx}
    `;
    return prisma.$queryRawUnsafe(sql, ...values);
  },

  /**
   * Most frequently restocked ingredients.
   * @param {number} limit
   * @returns {Array<{name, restockCount, totalQuantity, totalCost, unit}>}
   */
  async getMostRestocked(limit = 10) {
    return prisma.$queryRawUnsafe(`
      SELECT
        i.ingredient_name AS name,
        COUNT(rb.restock_id)::int AS "restockCount",
        ROUND(SUM(rb.quantity_added)::numeric, 2)::float AS "totalQuantity",
        ROUND(SUM(rb.total_cost)::numeric, 2)::float AS "totalCost",
        i.unit
      FROM restock_batches rb
      JOIN ingredients i ON i.ingredient_id = rb.ingredient_id
      WHERE i.is_archived = false
      GROUP BY i.ingredient_name, i.unit
      ORDER BY "restockCount" DESC
      LIMIT $1
    `, limit);
  },

  /**
   * Profit = Revenue - COGS for a period.
    */
  async getProfit(dateFrom, dateTo) {
    const revenueResult = await this.getOrderKpis(dateFrom, dateTo);
    const cogs = await this.getCOGS(dateFrom, dateTo);
    const losses = await this.getTotalLosses(dateFrom, dateTo);
    const revenue = revenueResult.revenue || 0;
    const lossAmount = losses.total_losses || 0;
    const profit = revenue - cogs - lossAmount;
    const margin = revenue > 0 ? Math.round((profit / revenue) * 1000) / 10 : 0;
    return { profit, margin };
  },

  /**
   * Total cost of losses for a period from loss_records.
   * @param {string|null} dateFrom
   * @param {string|null} dateTo
   * @returns {object} - { total_losses, order_losses, inventory_losses }
   */
  async getTotalLosses(dateFrom, dateTo) {
    const clauses = [];
    const values = [];
    let idx = 1;

    if (dateFrom) {
      clauses.push(`lr.logged_at >= $${idx++}::date`);
      values.push(dateFrom);
    }
    if (dateTo) {
      clauses.push(`lr.logged_at <= ($${idx++}::date + interval '1 day' - interval '1 second')`);
      values.push(dateTo);
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : '';
    const sql = `
      SELECT
        COALESCE(SUM(lr.total_cost_lost), 0)::float AS total_losses,
        COALESCE(SUM(lr.total_cost_lost) FILTER (WHERE lr.loss_type = 'cancellation'), 0)::float AS order_losses,
        COALESCE(SUM(lr.total_cost_lost) FILTER (WHERE lr.loss_type != 'cancellation'), 0)::float AS inventory_losses
      FROM loss_records lr
      ${where}
    `;
    const result = await prisma.$queryRawUnsafe(sql, ...values);
    return result[0] || { total_losses: 0, order_losses: 0, inventory_losses: 0 };
  },

  /**
   * Waste/loss breakdown by type for a period.
   * @param {string|null} dateFrom
   * @param {string|null} dateTo
   * @returns {Array<{type, count, totalCost}>}
   */
  async getWasteByType(dateFrom, dateTo) {
    const clauses = [];
    const values = [];
    let idx = 1;

    if (dateFrom) {
      clauses.push(`lr.logged_at >= $${idx++}::date`);
      values.push(dateFrom);
    }
    if (dateTo) {
      clauses.push(`lr.logged_at <= ($${idx++}::date + interval '1 day' - interval '1 second')`);
      values.push(dateTo);
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : '';
    const sql = `
      SELECT
        lr.loss_type AS type,
        COUNT(*)::int AS count,
        COALESCE(SUM(lr.total_cost_lost), 0)::float AS "totalCost"
      FROM loss_records lr
      ${where}
      GROUP BY lr.loss_type
      ORDER BY "totalCost" DESC
    `;
    return prisma.$queryRawUnsafe(sql, ...values);
  },

  /**
   * Total value of current inventory (remaining stock × cost).
   * @returns {object} - { totalValue, ingredientCount }
   */
  async getStockValue() {
    const result = await prisma.$queryRawUnsafe(`
      SELECT
        COALESCE(SUM(rb.quantity_left * rb.cost_per_unit), 0)::float AS "totalValue",
        COUNT(DISTINCT rb.ingredient_id)::int AS "ingredientCount"
      FROM restock_batches rb
      WHERE rb.quantity_left > 0
    `);
    return result[0] || { totalValue: 0, ingredientCount: 0 };
  },

  /**
   * Payment method breakdown for a date range.
   * @returns {Array<{method, amount, transactions}>}
   */
  async getPaymentMethodBreakdown(dateFrom, dateTo) {
    const values = [];
    let idx = 1;
    const dateClauses = [];
    if (dateFrom) dateClauses.push(`o.order_date >= $${idx++}::date`);
    if (dateTo) dateClauses.push(`o.order_date <= $${idx++}::date`);
    if (dateFrom) values.push(dateFrom);
    if (dateTo) values.push(dateTo);
    const dateWhere = dateClauses.length ? `WHERE ${dateClauses.join(" AND ")} AND o.status = 'completed'` : "WHERE o.status = 'completed'";

    const sql = `
      SELECT
        COALESCE(o.payment_method, 'cash') AS method,
        COALESCE(SUM(o.total_amount), 0)::float AS amount,
        COUNT(*)::int AS transactions
      FROM orders o
      ${dateWhere}
      GROUP BY o.payment_method
      ORDER BY amount DESC
    `;
    return prisma.$queryRawUnsafe(sql, ...values);
  },

  /**
   * Discount totals for a date range.
   * @returns {object} - { totalDiscounts, discountCount, byType }
   */
  async getDiscountSummary(dateFrom, dateTo) {
    const values = [];
    let idx = 1;
    const dateClauses = [];
    if (dateFrom) dateClauses.push(`d.created_at >= $${idx++}::date`);
    if (dateTo) dateClauses.push(`d.created_at <= $${idx++}::date`);
    if (dateFrom) values.push(dateFrom);
    if (dateTo) values.push(dateTo);
    const dateWhere = dateClauses.length ? `WHERE ${dateClauses.join(" AND ")}` : "";

    const sql = `
      SELECT
        COALESCE(SUM(d.amount), 0)::float AS "totalDiscounts",
        COUNT(*)::int AS "discountCount",
        COALESCE(SUM(CASE WHEN d.discount_type = 'senior' THEN d.amount END), 0)::float AS senior,
        COALESCE(SUM(CASE WHEN d.discount_type = 'pwd' THEN d.amount END), 0)::float AS pwd,
        COALESCE(SUM(CASE WHEN d.discount_type = 'promotional' THEN d.amount END), 0)::float AS promotional,
        COALESCE(SUM(CASE WHEN d.discount_type = 'employee' THEN d.amount END), 0)::float AS employee
      FROM discounts d
      ${dateWhere}
    `;
    const result = await prisma.$queryRawUnsafe(sql, ...values);
    return result[0] || { totalDiscounts: 0, discountCount: 0, senior: 0, pwd: 0, promotional: 0, employee: 0 };
  },

  /**
   * VAT summary for a date range.
   * VAT-exempt orders (senior/PWD) are excluded from 12% VAT calculation.
   * @returns {object} - { totalVat, vatExemptSales, taxableSales }
   */
  async getVatSummary(dateFrom, dateTo) {
    const values = [];
    let idx = 1;
    const dateClauses = [];
    if (dateFrom) dateClauses.push(`o.order_date >= $${idx++}::date`);
    if (dateTo) dateClauses.push(`o.order_date <= $${idx++}::date`);
    if (dateFrom) values.push(dateFrom);
    if (dateTo) values.push(dateTo);
    const dateWhere = dateClauses.length ? `WHERE ${dateClauses.join(" AND ")} AND o.status = 'completed'` : "WHERE o.status = 'completed'";

    const sql = `
      SELECT
        COALESCE(SUM(o.total_amount), 0)::float AS "taxableSales",
        COALESCE(SUM(CASE WHEN EXISTS (
          SELECT 1 FROM discounts d WHERE d.order_id = o.order_id AND d.discount_type IN ('senior', 'pwd')
        ) THEN o.total_amount ELSE 0 END), 0)::float AS "vatExemptSales"
      FROM orders o
      ${dateWhere}
    `;
    const result = await prisma.$queryRawUnsafe(sql, ...values);
    const row = result[0] || { taxableSales: 0, vatExemptSales: 0 };
    const actualTaxable = row.taxableSales - row.vatExemptSales;
    const totalVat = Math.round(actualTaxable / 1.12 * 0.12 * 100) / 100;
    return { totalVat, vatExemptSales: row.vatExemptSales, taxableSales: actualTaxable };
  },
};
