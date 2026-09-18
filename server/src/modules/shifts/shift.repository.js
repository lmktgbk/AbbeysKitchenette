import prisma from "../../config/prisma.js";

/**
 * Shift Repository (BR-02)
 *
 * All database queries for cashier drawer sessions.
 */
export const shiftRepository = {
  /* ── Open shifts ─────────────────────────── */

  /**
   * Find open shifts for a user (one at most — enforced on open).
   */
  async findOpenByUser(userId) {
    return prisma.shift.findMany({
      where: { openedBy: userId, status: "open" },
      include: {
        opener: { select: { id: true, name: true, role: true } },
      },
      orderBy: { openedAt: "desc" },
    });
  },

  async findById(id) {
    return prisma.shift.findUnique({
      where: { shiftId: id },
      include: {
        opener: { select: { id: true, name: true, role: true } },
        closer: { select: { id: true, name: true, role: true } },
      },
    });
  },

  async create({ openingCash, openedBy }) {
    return prisma.shift.create({
      data: { openingCash, openedBy, status: "open" },
      include: {
        opener: { select: { id: true, name: true, role: true } },
      },
    });
  },

  async close(id, { expectedCash, actualCash, variance, closeNote, closedBy }, tx) {
    const client = tx || prisma;
    return client.shift.update({
      where: { shiftId: id },
      data: {
        status: "closed",
        closedAt: new Date(),
        closedBy,
        expectedCash,
        actualCash,
        variance,
        closeNote: closeNote ?? null,
      },
    });
  },

  /* ── Summary aggregates ──────────────────── */

  /**
   * Cash + per-method sales for a shift window.
   * Only paid orders count: accepted/preparing/completed (pending is
   * unpaid, cancelled is voided).
   * @returns {{ cashSales, gcashSales, mayaSales, cashOrders, totalOrders }}
   */
  async getShiftSales(shiftId, openedAt, closedAt) {
    const end = closedAt ?? new Date();
    const rows = await prisma.$queryRaw`
      SELECT
        COALESCE(payment_method, 'cash') AS method,
        COUNT(*)::int AS orders,
        COALESCE(SUM(total_amount), 0)::float AS sales
      FROM orders
      WHERE shift_id = ${shiftId}::uuid
        AND status IN ('accepted', 'preparing', 'completed')
        AND accepted_at >= ${openedAt}
        AND accepted_at <= ${end}
      GROUP BY payment_method
    `;
    const out = { cashSales: 0, gcashSales: 0, mayaSales: 0, cashOrders: 0, totalOrders: 0 };
    for (const r of rows) {
      const sales = Number(r.sales || 0);
      out.totalOrders += Number(r.orders || 0);
      if (r.method === "cash") {
        out.cashSales = sales;
        out.cashOrders = Number(r.orders || 0);
      } else if (r.method === "gcash") {
        out.gcashSales = sales;
      } else if (r.method === "maya") {
        out.mayaSales = sales;
      } else {
        // Legacy/unknown methods (e.g. card) tracked but never drawer cash.
        out.totalOrders += 0;
      }
    }
    return out;
  },

  /**
   * Cash refunds issued against orders paid in this shift.
   */
  async getShiftCashRefunds(shiftId) {
    const rows = await prisma.$queryRaw`
      SELECT COALESCE(SUM(pr.amount), 0)::float AS refunds,
             COUNT(pr.refund_id)::int AS count
      FROM payment_refunds pr
      JOIN orders o ON o.order_id = pr.order_id
      WHERE o.shift_id = ${shiftId}::uuid
        AND (o.payment_method IS NULL OR o.payment_method = 'cash')
    `;
    return {
      cashRefunds: Number(rows[0]?.refunds || 0),
      refundCount: Number(rows[0]?.count || 0),
    };
  },

  /**
   * Paid orders still in the kitchen (accepted/preparing, not
   * completed/cancelled). Their cash is already in the drawer —
   * surfaced as a close-time warning, never a blocker.
   */
  async getShiftOpenOrders(shiftId, openedAt, closedAt) {
    const end = closedAt ?? new Date();
    const rows = await prisma.$queryRaw`
      SELECT COUNT(*)::int AS count,
             COALESCE(SUM(total_amount), 0)::float AS total
      FROM orders
      WHERE shift_id = ${shiftId}::uuid
        AND status IN ('accepted', 'preparing')
        AND accepted_at >= ${openedAt}
        AND accepted_at <= ${end}
    `;
    return {
      openCount: Number(rows[0]?.count || 0),
      openTotal: Number(rows[0]?.total || 0),
    };
  },

  /**
   * Closed shifts for one cashier (own history, latest first).
   */
  async findClosedByUser(userId, limit = 20) {
    return prisma.shift.findMany({
      where: { openedBy: userId, status: "closed" },
      orderBy: { openedAt: "desc" },
      take: limit,
    });
  },

  /**
   * Period stats for the Shifts KPI row.
   * Sessions opened in [from, to]; open_now counts all live drawers.
   */
  async getStats(from, to) {
    const openNow = await prisma.shift.count({ where: { status: "open" } });
    const sessions = await prisma.shift.findMany({
      where: { openedAt: { gte: from, lte: to } },
      select: { shiftId: true, openedAt: true, closedAt: true, openingCash: true, status: true, expectedCash: true, actualCash: true, variance: true },
    });

    let cashSales = 0, cashRefunds = 0, gcashSales = 0, mayaSales = 0, varianceTotal = 0, offCount = 0;
    for (const s of sessions) {
      const [sales, refunds] = await Promise.all([
        this.getShiftSales(s.shiftId, s.openedAt, s.closedAt),
        this.getShiftCashRefunds(s.shiftId),
      ]);
      cashSales += sales.cashSales;
      cashRefunds += refunds.cashRefunds;
      gcashSales += sales.gcashSales;
      mayaSales += sales.mayaSales;
      if (s.status === "closed") {
        const v = s.variance != null ? Number(s.variance) : 0;
        varianceTotal += v;
        if (v !== 0) offCount += 1;
      }
    }
    const round = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
    return {
      openNow,
      sessions: sessions.length,
      cashSales: round(cashSales),
      cashRefunds: round(cashRefunds),
      gcashSales: round(gcashSales),
      mayaSales: round(mayaSales),
      varianceTotal: round(varianceTotal),
      offCount,
    };
  },

  /**
   * Orders attributed to one shift (windowed, latest first).
   */
  async findOrdersByShift(shiftId, { skip = 0, take = 15, status = "all" } = {}) {
    const where = { shiftId };
    if (status && status !== "all") where.status = status;
    return prisma.order.findMany({
      where,
      include: {
        items: {
          include: {
            product: { select: { productName: true } },
            variant: { select: { sizeName: true } },
          },
        },
      },
      orderBy: { acceptedAt: "desc" },
      skip,
      take,
    });
  },

  async countOrdersByShift(shiftId, status = "all") {
    const where = { shiftId };
    if (status && status !== "all") where.status = status;
    return prisma.order.count({ where });
  },

  /* ── Admin list ──────────────────────────── */

  async findManyPaginated({ skip, take, status, staffId, dateFrom, dateTo }) {
    const clauses = [];
    const values = [];
    let idx = 1;

    if (status && status !== "all") {
      clauses.push(`s.status = $${idx++}`);
      values.push(status);
    }
    if (staffId) {
      clauses.push(`s.opened_by = $${idx++}::uuid`);
      values.push(staffId);
    }
    if (dateFrom) {
      clauses.push(`s.opened_at >= $${idx++}::date`);
      values.push(dateFrom);
    }
    if (dateTo) {
      clauses.push(`s.opened_at < ($${idx++}::date + INTERVAL '1 day')`);
      values.push(dateTo);
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";

    const sql = `
      SELECT
        s.shift_id, s.opened_by, s.opened_at, s.opening_cash,
        s.status, s.closed_at, s.closed_by, s.expected_cash, s.actual_cash,
        s.variance, s.close_note,
        u_open.name AS opener_name,
        u_close.name AS closer_name,
        COUNT(*) OVER() AS total_count
      FROM shifts s
      LEFT JOIN "User" u_open ON u_open.id = s.opened_by
      LEFT JOIN "User" u_close ON u_close.id = s.closed_by
      ${where}
      ORDER BY s.opened_at DESC
      LIMIT $${idx++} OFFSET $${idx++}
    `;
    values.push(take, skip);
    return prisma.$queryRawUnsafe(sql, ...values);
  },

  async countFiltered({ status, staffId, dateFrom, dateTo }) {
    const clauses = [];
    const values = [];
    let idx = 1;

    if (status && status !== "all") {
      clauses.push(`s.status = $${idx++}`);
      values.push(status);
    }
    if (staffId) {
      clauses.push(`s.opened_by = $${idx++}::uuid`);
      values.push(staffId);
    }
    if (dateFrom) {
      clauses.push(`s.opened_at >= $${idx++}::date`);
      values.push(dateFrom);
    }
    if (dateTo) {
      clauses.push(`s.opened_at < ($${idx++}::date + INTERVAL '1 day')`);
      values.push(dateTo);
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const result = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS count FROM shifts s ${where}`,
      ...values,
    );
    return result[0]?.count ?? 0;
  },
};
