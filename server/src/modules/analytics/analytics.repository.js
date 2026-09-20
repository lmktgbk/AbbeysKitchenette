import prisma from "../../config/prisma.js";

/**
 * Analytics Repository — correct financials
 * Gross = subtotal_amount, Net = total_amount, Discounts = difference
 * Transactions = completed orders only, COGS = actual FIFO cost
 */
export const analyticsRepository = {
  async getFinancialKpis(dateFrom, dateTo) {
    const values = [];
    let idx = 1;
    const clauses = [];
    if (dateFrom) {
      clauses.push(`o.order_date >= $${idx++}::date`);
      values.push(dateFrom);
    }
    if (dateTo) {
      clauses.push(`o.order_date <= $${idx++}::date`);
      values.push(dateTo);
    }
    const dateWhere = clauses.length ? `AND ${clauses.join(" AND ")}` : "";

    // Gross / Discounts / Net / Transactions
    const financialSql = `
      SELECT
        COALESCE(SUM(CASE WHEN o.status = 'completed' THEN o.subtotal_amount END), 0)::float AS gross_sales,
        COALESCE(SUM(CASE WHEN o.status = 'completed' THEN o.discount_amount END), 0)::float AS discounts,
        COALESCE(SUM(CASE WHEN o.status = 'completed' THEN o.total_amount END), 0)::float AS net_sales,
        COUNT(*) FILTER (WHERE o.status = 'completed')::int AS transactions
      FROM orders o
      WHERE 1=1 ${dateWhere}
    `;
    const fin = await prisma.$queryRawUnsafe(financialSql, ...values);
    const row = fin[0] || { gross_sales: 0, discounts: 0, net_sales: 0, transactions: 0 };

    // Total units for completed orders
    const unitsValues = [...values];
    const unitsSql = `
      SELECT COALESCE(SUM(oi.quantity), 0)::int AS total_units
      FROM order_items oi
      JOIN orders o ON o.order_id = oi.order_id
      WHERE o.status = 'completed' AND oi.removed_at IS NULL ${dateWhere.replace(/o\./g, "o.")}
    `;
    // Rebuild dateWhere for units with correct table alias o is still orders
    const unitsRes = await prisma.$queryRawUnsafe(unitsSql, ...unitsValues);
    const totalUnits = unitsRes[0]?.total_units || 0;

    // COGS = actual FIFO cost from deductions
    const cogsValues = [...values];
    const cogsSql = `
      SELECT COALESCE(SUM(d.quantity_deducted * d.cost_per_unit), 0)::float AS cogs
      FROM order_ingredient_deductions d
      JOIN orders o ON o.order_id = d.order_id
      WHERE o.status = 'completed' AND d.reversed_at IS NULL ${dateWhere}
    `;
    const cogsRes = await prisma.$queryRawUnsafe(cogsSql, ...cogsValues);
    const cogs = cogsRes[0]?.cogs || 0;

    // Losses
    const lossValues = [];
    let lossIdx = 1;
    const lossClauses = [];
    if (dateFrom) {
      lossClauses.push(`lr.logged_at >= $${lossIdx++}::date`);
      lossValues.push(dateFrom);
    }
    if (dateTo) {
      lossClauses.push(`lr.logged_at <= ($${lossIdx++}::date + interval '1 day' - interval '1 second')`);
      lossValues.push(dateTo);
    }
    const lossWhere = lossClauses.length ? `WHERE ${lossClauses.join(" AND ")}` : "";
    const lossSql = `SELECT COALESCE(SUM(lr.total_cost_lost), 0)::float AS total_losses FROM loss_records lr ${lossWhere}`;
    const lossRes = await prisma.$queryRawUnsafe(lossSql, ...lossValues);
    const totalLosses = lossRes[0]?.total_losses || 0;

    const grossSales = row.gross_sales || 0;
    const discounts = row.discounts || 0;
    const netSales = row.net_sales || 0;
    const transactions = row.transactions || 0;
    const atv = transactions > 0 ? Math.round((netSales / transactions) * 100) / 100 : 0;
    const unitsPerTxn = transactions > 0 ? Math.round((totalUnits / transactions) * 100) / 100 : 0;
    const grossProfit = Math.round((netSales - cogs) * 100) / 100;
    const grossMargin = netSales > 0 ? Math.round((grossProfit / netSales) * 1000) / 10 : 0;
    const netProfit = Math.round((grossProfit - totalLosses) * 100) / 100;
    const netMargin = netSales > 0 ? Math.round((netProfit / netSales) * 1000) / 10 : 0;
    const lossRate = cogs > 0 ? Math.round((totalLosses / cogs) * 1000) / 10 : 0;

    return {
      grossSales,
      discounts,
      netSales,
      transactions,
      totalUnits,
      atv,
      unitsPerTxn,
      cogs,
      grossProfit,
      grossMargin,
      totalLosses,
      lossRate,
      netProfit,
      netMargin,
    };
  },

  async getPreviousPeriodKpis(dateFrom, dateTo) {
    if (!dateFrom || !dateTo) return null;
    const from = new Date(dateFrom);
    const to = new Date(dateTo);
    const diffDays = Math.ceil((to - from) / 86400000) + 1;
    const prevTo = new Date(from);
    prevTo.setDate(prevTo.getDate() - 1);
    const prevFrom = new Date(prevTo);
    prevFrom.setDate(prevFrom.getDate() - diffDays + 1);
    const pf = prevFrom.toISOString().split("T")[0];
    const pt = prevTo.toISOString().split("T")[0];
    return this.getFinancialKpis(pf, pt);
  },

  async getVariantProfitability({ dateFrom, dateTo, search, limit = 10, offset = 0 }) {
    const values = [];
    let idx = 1;
    const whereClauses = ["o.status = 'completed'", "oi.removed_at IS NULL"];
    if (dateFrom) {
      whereClauses.push(`o.order_date >= $${idx++}::date`);
      values.push(dateFrom);
    }
    if (dateTo) {
      whereClauses.push(`o.order_date <= $${idx++}::date`);
      values.push(dateTo);
    }
    if (search) {
      whereClauses.push(`(p.product_name ILIKE $${idx} OR v.size_name ILIKE $${idx})`);
      values.push(`%${search}%`);
      idx++;
    }
    const where = `WHERE ${whereClauses.join(" AND ")}`;
    const dataSql = `
      WITH avg_costs AS (
        SELECT ingredient_id, CASE WHEN SUM(quantity_added)>0 THEN SUM(quantity_added*cost_per_unit)/SUM(quantity_added) ELSE 0 END AS avg_cost
        FROM restock_batches GROUP BY ingredient_id
      )
      SELECT
        v.variant_id AS variant_id,
        p.product_name AS product_name,
        v.size_name AS size_name,
        SUM(oi.quantity)::int AS units,
        ROUND(SUM(oi.subtotal)::numeric,2)::float AS net_sales,
        ROUND(COALESCE(SUM(oi.quantity * r.quantity_needed * COALESCE(ac.avg_cost,0))::numeric,0),2)::float AS cogs,
        ROUND((SUM(oi.subtotal) - COALESCE(SUM(oi.quantity * r.quantity_needed * COALESCE(ac.avg_cost,0)),0))::numeric,2)::float AS profit,
        CASE WHEN SUM(oi.subtotal) > 0 THEN ROUND(((SUM(oi.subtotal) - COALESCE(SUM(oi.quantity * r.quantity_needed * COALESCE(ac.avg_cost,0)),0)) / SUM(oi.subtotal) *100)::numeric,1)::float ELSE 0 END AS margin
      FROM order_items oi
      JOIN orders o ON o.order_id = oi.order_id
      JOIN product_variants v ON v.variant_id = oi.variant_id
      JOIN products p ON p.product_id = v.product_id
      LEFT JOIN recipes r ON r.variant_id = v.variant_id
      LEFT JOIN avg_costs ac ON ac.ingredient_id = r.ingredient_id
      ${where}
      GROUP BY v.variant_id, p.product_name, v.size_name
      ORDER BY profit DESC
      LIMIT $${idx++} OFFSET $${idx++}
    `;
    values.push(limit, offset);
    const countSql = `
      SELECT COUNT(*)::int AS total FROM (
        SELECT v.variant_id FROM order_items oi
        JOIN orders o ON o.order_id = oi.order_id
        JOIN product_variants v ON v.variant_id = oi.variant_id
        JOIN products p ON p.product_id = v.product_id
        ${where}
        GROUP BY v.variant_id
      ) t
    `;
    // countValues without limit/offset
    const countValues = values.slice(0, values.length - 2);
    const [rows, countRes] = await Promise.all([
      prisma.$queryRawUnsafe(dataSql, ...values),
      prisma.$queryRawUnsafe(countSql, ...countValues),
    ]);
    return { rows, total: countRes[0]?.total || 0 };
  },

  async getIngredientProfitability({ dateFrom, dateTo, search, limit = 10, offset = 0 } = {}) {
    const values = [];
    let idx = 1;
    const batchClauses = [];
    const lossClauses = [];
    if (dateFrom) {
      batchClauses.push(`rb.restocked_at >= $${idx}::date`);
      lossClauses.push(`lr.logged_at >= $${idx}::date`);
      values.push(dateFrom);
      idx++;
    }
    if (dateTo) {
      batchClauses.push(`rb.restocked_at <= ($${idx}::date + interval '1 day' - interval '1 second')`);
      lossClauses.push(`lr.logged_at <= ($${idx}::date + interval '1 day' - interval '1 second')`);
      values.push(dateTo);
      idx++;
    }
    const searchClause = search ? `AND i.ingredient_name ILIKE $${idx}` : "";
    if (search) {
      values.push(`%${search}%`);
      idx++;
    }
    const batchWhere = batchClauses.length ? `WHERE ${batchClauses.join(" AND ")}` : "";
    const lossWhere = lossClauses.length ? `WHERE ${lossClauses.join(" AND ")}` : "";
    const stockSql = `SELECT ingredient_id, COALESCE(SUM(quantity_left * cost_per_unit),0)::float AS stock_value, COALESCE(SUM(quantity_left),0)::float AS stock_qty FROM restock_batches WHERE quantity_left > 0 GROUP BY ingredient_id`;
    const sql = `
      SELECT i.ingredient_id, i.ingredient_name, i.unit,
        COALESCE(s.stock_value,0)::float AS stock_value,
        COALESCE(s.stock_qty,0)::float AS stock_qty,
        COALESCE(b.total_spend,0)::float AS total_spend,
        COALESCE(b.restock_count,0)::int AS restock_count,
        COALESCE(l.total_waste,0)::float AS total_waste,
        COALESCE(l.waste_count,0)::int AS waste_count,
        COALESCE(s.stock_value,0) - COALESCE(l.total_waste,0) AS net_position
      FROM ingredients i
      LEFT JOIN (${stockSql}) s ON s.ingredient_id = i.ingredient_id
      LEFT JOIN (
        SELECT rb.ingredient_id, COUNT(*)::int AS restock_count, COALESCE(SUM(rb.quantity_added * rb.cost_per_unit),0)::float AS total_spend
        FROM restock_batches rb ${batchWhere} GROUP BY rb.ingredient_id
      ) b ON b.ingredient_id = i.ingredient_id
      LEFT JOIN (
        SELECT lr.ingredient_id, COUNT(*)::int AS waste_count, COALESCE(SUM(lr.total_cost_lost),0)::float AS total_waste
        FROM loss_records lr ${lossWhere} GROUP BY lr.ingredient_id
      ) l ON l.ingredient_id = i.ingredient_id
      WHERE i.is_archived = false ${searchClause}
      ORDER BY net_position DESC
      LIMIT $${idx++} OFFSET $${idx++}
    `;
    values.push(limit, offset);
    const countSql = `SELECT COUNT(*)::int AS total FROM ingredients i WHERE i.is_archived = false ${searchClause}`;
    const countValues = search ? [values[idx - 3]] : [];
    const [rows, countRes] = await Promise.all([
      prisma.$queryRawUnsafe(sql, ...values),
      prisma.$queryRawUnsafe(countSql, ...countValues),
    ]);
    return { rows, total: countRes[0]?.total || 0 };
  },

  async getOrdersLedger({ dateFrom, dateTo } = {}) {
    const values = [];
    let idx = 1;
    const clauses = ["o.status = 'completed'"];
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
      SELECT o.order_number, o.order_date::text AS order_date, o.customer_name, o.table_number, o.order_source, o.status,
        o.subtotal_amount::float AS gross, o.discount_amount::float AS discounts, o.total_amount::float AS net, o.payment_method,
        u.name AS cashier,
        COALESCE(q.units,0)::int AS units,
        COALESCE(c.cogs,0)::float AS cogs,
        ROUND((o.total_amount - COALESCE(c.cogs,0))::numeric,2)::float AS profit,
        CASE WHEN o.total_amount > 0 THEN ROUND(((o.total_amount - COALESCE(c.cogs,0))/o.total_amount*100)::numeric,1)::float ELSE 0 END AS margin
      FROM orders o
      LEFT JOIN "User" u ON u.id = o.accepted_by
      LEFT JOIN (
        SELECT oi.order_id, SUM(oi.quantity)::int AS units FROM order_items oi WHERE oi.removed_at IS NULL GROUP BY oi.order_id
      ) q ON q.order_id = o.order_id
      LEFT JOIN (
        SELECT d.order_id, SUM(d.quantity_deducted * d.cost_per_unit)::float AS cogs
        FROM order_ingredient_deductions d WHERE d.reversed_at IS NULL GROUP BY d.order_id
      ) c ON c.order_id = o.order_id
      ${where}
      ORDER BY o.order_date ASC, o.order_number ASC
    `;
    const rows = await prisma.$queryRawUnsafe(sql, ...values);
    // Compute totals
    const totals = rows.reduce((acc, r) => ({
      gross: acc.gross + Number(r.gross || 0),
      discounts: acc.discounts + Number(r.discounts || 0),
      net: acc.net + Number(r.net || 0),
      cogs: acc.cogs + Number(r.cogs || 0),
      profit: acc.profit + Number(r.profit || 0),
    }), { gross: 0, discounts: 0, net: 0, cogs: 0, profit: 0 });
    return { rows, totals };
  },

  async getWasteDetails({ dateFrom, dateTo, type, search, limit = 20, offset = 0 }) {
    const values = [];
    let idx = 1;
    const clauses = [];
    if (dateFrom) {
      clauses.push(`lr.logged_at >= $${idx++}::date`);
      values.push(dateFrom);
    }
    if (dateTo) {
      clauses.push(`lr.logged_at <= ($${idx++}::date + interval '1 day' - interval '1 second')`);
      values.push(dateTo);
    }
    if (type && type !== "all") {
      clauses.push(`lr.loss_type = $${idx++}`);
      values.push(type);
    }
    if (search) {
      clauses.push(`(i.ingredient_name ILIKE $${idx} OR lr.notes ILIKE $${idx})`);
      values.push(`%${search}%`);
      idx++;
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const dataSql = `
      SELECT lr.loss_id, lr.loss_type AS type, lr.quantity_lost, lr.total_cost_lost, lr.logged_at, lr.notes, i.ingredient_name, i.unit, lr.related_order_id
      FROM loss_records lr
      JOIN ingredients i ON i.ingredient_id = lr.ingredient_id
      ${where}
      ORDER BY lr.logged_at DESC
      LIMIT $${idx++} OFFSET $${idx++}
    `;
    values.push(limit, offset);
    const countSql = `SELECT COUNT(*)::int AS total FROM loss_records lr JOIN ingredients i ON i.ingredient_id = lr.ingredient_id ${where}`;
    const countValues = values.slice(0, values.length - 2);
    const [rows, countRes] = await Promise.all([
      prisma.$queryRawUnsafe(dataSql, ...values),
      prisma.$queryRawUnsafe(countSql, ...countValues),
    ]);
    return { rows, total: countRes[0]?.total || 0 };
  },
};
