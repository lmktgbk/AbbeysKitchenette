import prisma from "../../config/prisma.js";

/**
 * Transaction Repository (BR-03)
 *
 * Read-only money ledger: one UNION over payments, refunds, and
 * drawer variances, newest first. Amounts carry their sign —
 * payments positive, refunds and shortages negative.
 */
export const transactionRepository = {
  /**
   * Paginated ledger rows with filters.
   * @param {object} params - { skip, take, dateFrom, dateTo, method, type, staffId }
   * @returns {Array} - ledger rows + total_count window column
   */
  async findManyPaginated({ skip, take, dateFrom, dateTo, method, type, staffId }) {
    const clauses = [];
    const values = [];
    let idx = 1;

    if (dateFrom) {
      clauses.push(`t.ts >= $${idx++}::date`);
      values.push(dateFrom);
    }
    if (dateTo) {
      clauses.push(`t.ts < ($${idx++}::date + INTERVAL '1 day')`);
      values.push(dateTo);
    }
    if (method && method !== "all") {
      clauses.push(`t.method = $${idx++}`);
      values.push(method);
    }
    if (type && type !== "all") {
      clauses.push(`t.type = $${idx++}`);
      values.push(type);
    }
    if (staffId) {
      clauses.push(`t.staff_id = $${idx++}::uuid`);
      values.push(staffId);
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";

    const sql = `
      WITH ledger AS (
        -- Payments: cash lands in the drawer at acceptance
        SELECT
          o.order_id::text AS id,
          o.accepted_at AS ts,
          'payment' AS type,
          COALESCE(o.payment_method, 'cash') AS method,
          -- Tendered cash (paid minus change), matching the drawer math in
          -- shifts.getShiftSales: cancelled-but-paid orders show tender so
          -- the refund leg nets them to zero as the drawer saw it.
          CASE
            WHEN o.amount_paid IS NULL THEN o.total_amount::float
            ELSE (o.amount_paid - COALESCE(o.change, 0))::float
          END AS amount,
          o.order_id AS order_id,
          o.order_number AS order_number,
          o.accepted_by AS staff_id,
          u.name AS staff_name,
          NULL::text AS note
        FROM orders o
        LEFT JOIN "User" u ON u.id = o.accepted_by
        WHERE (o.status IN ('accepted', 'preparing', 'completed')
               OR (o.status = 'cancelled' AND COALESCE(o.amount_paid, 0) > 0))
          AND o.accepted_at IS NOT NULL
        UNION ALL
        -- Refunds: money leaves the drawer
        SELECT
          ('refund-' || pr.refund_id)::text AS id,
          pr.refunded_at AS ts,
          'refund' AS type,
          COALESCE(o.payment_method, 'cash') AS method,
          (-pr.amount)::float AS amount,
          pr.order_id AS order_id,
          o.order_number AS order_number,
          pr.refunded_by AS staff_id,
          u.name AS staff_name,
          pr.reason AS note
        FROM payment_refunds pr
        JOIN orders o ON o.order_id = pr.order_id
        LEFT JOIN "User" u ON u.id = pr.refunded_by
        UNION ALL
        -- Drawer variances: nonzero closes only (balanced moves nothing)
        SELECT
          s.shift_id::text AS id,
          s.closed_at AS ts,
          'variance' AS type,
          'cash' AS method,
          s.variance::float AS amount,
          NULL::uuid AS order_id,
          NULL::int AS order_number,
          s.closed_by AS staff_id,
          u.name AS staff_name,
          s.close_note AS note
        FROM shifts s
        LEFT JOIN "User" u ON u.id = s.closed_by
        WHERE s.status = 'closed'
          AND s.variance IS NOT NULL
          AND s.variance <> 0
      )
      SELECT t.*, COUNT(*) OVER() AS total_count
      FROM ledger t
      ${where}
      ORDER BY t.ts DESC
      LIMIT $${idx++} OFFSET $${idx++}
    `;
    values.push(take, skip);
    return prisma.$queryRawUnsafe(sql, ...values);
  },

  /**
   * Inflow/outflow totals over the same filtered set (whole range,
   * not just the page) for the ledger header.
   */
  async sumFiltered({ dateFrom, dateTo, method, type, staffId }) {
    const clauses = [];
    const values = [];
    let idx = 1;

    if (dateFrom) {
      clauses.push(`t.ts >= $${idx++}::date`);
      values.push(dateFrom);
    }
    if (dateTo) {
      clauses.push(`t.ts < ($${idx++}::date + INTERVAL '1 day')`);
      values.push(dateTo);
    }
    if (method && method !== "all") {
      clauses.push(`t.method = $${idx++}`);
      values.push(method);
    }
    if (type && type !== "all") {
      clauses.push(`t.type = $${idx++}`);
      values.push(type);
    }
    if (staffId) {
      clauses.push(`t.staff_id = $${idx++}::uuid`);
      values.push(staffId);
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";

    const sql = `
      WITH ledger AS (
        SELECT o.accepted_at AS ts,
               'payment' AS type,
               COALESCE(o.payment_method, 'cash') AS method,
               CASE
                 WHEN o.amount_paid IS NULL THEN o.total_amount::float
                 ELSE (o.amount_paid - COALESCE(o.change, 0))::float
               END AS amount,
               o.accepted_by AS staff_id
        FROM orders o
        WHERE (o.status IN ('accepted', 'preparing', 'completed')
               OR (o.status = 'cancelled' AND COALESCE(o.amount_paid, 0) > 0))
          AND o.accepted_at IS NOT NULL
        UNION ALL
        SELECT pr.refunded_at AS ts,
               'refund' AS type,
               COALESCE(o.payment_method, 'cash') AS method,
               (-pr.amount)::float AS amount,
               pr.refunded_by AS staff_id
        FROM payment_refunds pr
        JOIN orders o ON o.order_id = pr.order_id
        UNION ALL
        SELECT s.closed_at AS ts,
               'variance' AS type,
               'cash' AS method,
               s.variance::float AS amount,
               s.closed_by AS staff_id
        FROM shifts s
        WHERE s.status = 'closed'
          AND s.variance IS NOT NULL
          AND s.variance <> 0
      )
      SELECT COALESCE(SUM(CASE WHEN t.amount >= 0 THEN t.amount ELSE 0 END), 0)::float AS inflow,
             COALESCE(SUM(CASE WHEN t.amount < 0 THEN -t.amount ELSE 0 END), 0)::float AS outflow
      FROM ledger t
      ${where}
    `;
    const rows = await prisma.$queryRawUnsafe(sql, ...values);
    return {
      inflow: Number(rows[0]?.inflow || 0),
      outflow: Number(rows[0]?.outflow || 0),
    };
  },
};
