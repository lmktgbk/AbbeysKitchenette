import prisma from "../../config/prisma.js";

/**
 * Staff Repository
 *
 * Data access layer for staff (User) management.
 * All methods are pure database queries — no business logic.
 */

const SAFE_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  mustChangePwd: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
};

export const staffRepository = {
  /**
   * Count staff with optional filters.
   */
  async countFiltered({ search, role, status }) {
    const where = this._buildWhereClause({ search, role, status });
    return prisma.user.count({ where });
  },

  /**
   * Find paginated staff with filters and sort.
   */
  async findPaginated({ search, role, status, sortBy, sortDir, skip, take }) {
    const where = this._buildWhereClause({ search, role, status });
    const orderBy = this._buildOrderBy(sortBy, sortDir);

    return prisma.user.findMany({
      where,
      orderBy,
      skip,
      take,
      select: SAFE_SELECT,
    });
  },

  /**
   * Find staff by ID.
   */
  async findById(id) {
    return prisma.user.findUnique({
      where: { id },
      select: SAFE_SELECT,
    });
  },

  /**
   * Find staff by email.
   */
  async findByEmail(email) {
    return prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true },
    });
  },

  /**
   * Create a new staff member.
   */
  async create({ name, email, role, passwordHash, pinHash, mustChangePwd }) {
    return prisma.user.create({
      data: {
        name,
        email,
        role,
        passwordHash: passwordHash || "",
        pinHash: pinHash || null,
        mustChangePwd: mustChangePwd || false,
        isActive: true,
      },
      select: SAFE_SELECT,
    });
  },

  /**
   * Update staff fields.
   */
  async update(id, data) {
    return prisma.user.update({
      where: { id },
      data,
      select: SAFE_SELECT,
    });
  },

  /**
   * Toggle active status.
   */
  async setActive(id, isActive) {
    return prisma.user.update({
      where: { id },
      data: { isActive },
      select: { id: true, isActive: true },
    });
  },

  /**
   * Reset PIN hash and set mustChangePwd flag.
   */
  async resetPin(id, pinHash) {
    return prisma.user.update({
      where: { id },
      data: { pinHash, mustChangePwd: true },
      select: { id: true, mustChangePwd: true },
    });
  },

  /**
   * Reset password hash.
   */
  async resetPassword(id, passwordHash) {
    return prisma.user.update({
      where: { id },
      data: { passwordHash },
      select: { id: true },
    });
  },

  /**
   * Hard delete staff.
   */
  async deleteUser(id) {
    return prisma.user.delete({
      where: { id },
      select: { id: true, name: true },
    });
  },

  /**
   * Check if staff has transaction history (restock, loss, orders).
   */
  async hasTransactions(id) {
    const [restockCount, lossCount, orderCount] = await Promise.all([
      prisma.restockBatch.count({ where: { restockedById: id } }),
      prisma.lossRecord.count({ where: { declaredById: id } }),
      prisma.order.count({
        where: {
          OR: [
            { createdBy: id },
            { acceptedBy: id },
            { preparingBy: id },
            { completedBy: id },
          ],
        },
      }),
    ]);
    return restockCount + lossCount + orderCount > 0;
  },

  /**
   * Get performance metrics for staff.
   * Cashier: orders created, revenue, avg order value.
   * Kitchen: items prepared (from order_items), avg prep time per item.
   * Admin is excluded.
   */
  async getPerformance({ role, dateFrom, dateTo }) {
    const roleFilter = role && role !== "all" ? { role } : { role: { in: ["cashier", "kitchen"] } };

    const users = await prisma.user.findMany({
      where: roleFilter,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
      orderBy: { name: "asc" },
    });

    const userIds = users.map((u) => u.id);
    if (userIds.length === 0) return [];

    const cashierIds = users.filter((u) => u.role === "cashier").map((u) => u.id);
    const kitchenIds = users.filter((u) => u.role === "kitchen").map((u) => u.id);

    const results = [];

    // ── Cashier metrics ──────────────────────────
    if (cashierIds.length > 0) {
      const createdWhere = {
        createdBy: { in: cashierIds },
        status: { not: "cancelled" },
      };
      if (dateFrom || dateTo) {
        createdWhere.createdAt = {};
        if (dateFrom) createdWhere.createdAt.gte = new Date(dateFrom);
        if (dateTo) {
          const end = new Date(dateTo);
          end.setHours(23, 59, 59, 999);
          createdWhere.createdAt.lte = end;
        }
      }

      const cashierOrders = await prisma.order.findMany({
        where: createdWhere,
        select: {
          createdBy: true,
          totalAmount: true,
        },
      });

      const cashierAgg = {};
      for (const o of cashierOrders) {
        if (!cashierAgg[o.createdBy]) cashierAgg[o.createdBy] = { count: 0, revenue: 0 };
        cashierAgg[o.createdBy].count += 1;
        cashierAgg[o.createdBy].revenue += Number(o.totalAmount);
      }

      for (const user of users.filter((u) => u.role === "cashier")) {
        const agg = cashierAgg[user.id] || { count: 0, revenue: 0 };
        results.push({
          user_id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          orders_created: agg.count,
          total_revenue: agg.revenue,
          avg_order_value: agg.count > 0 ? Math.round(agg.revenue / agg.count) : 0,
        });
      }
    }

    // ── Kitchen metrics ──────────────────────────
    // Track at item level: who prepared what, not just who clicked "complete"
    if (kitchenIds.length > 0) {
      const kitchenPlaceholders = kitchenIds.map((_, i) => `$${i + 1}`).join(", ");
      let idx = kitchenIds.length + 1;

      const dateConditions = [];
      const values = [...kitchenIds];

      if (dateFrom) {
        dateConditions.push(`o.order_date >= $${idx++}::date`);
        values.push(dateFrom);
      }
      if (dateTo) {
        dateConditions.push(`o.order_date <= $${idx++}::date`);
        values.push(dateTo);
      }

      const dateClause = dateConditions.length > 0 ? `AND ${dateConditions.join(" AND ")}` : "";

      const kitchenRows = await prisma.$queryRawUnsafe(`
        SELECT
          oi.prepared_by AS "userId",
          COUNT(*)::int AS "itemsPrepared",
          COUNT(DISTINCT oi.order_id)::int AS "ordersInvolved",
          ROUND(AVG(EXTRACT(EPOCH FROM (oi.prepared_at - o.preparing_at)) / 60)::numeric, 0)::int AS "avgPrepMinutes"
        FROM order_items oi
        JOIN orders o ON o.order_id = oi.order_id
        WHERE oi.prepared_by IN (${kitchenPlaceholders})
          AND oi.is_prepared = true
          AND oi.removed_at IS NULL
          AND o.preparing_at IS NOT NULL
          AND o.status != 'cancelled'
          ${dateClause}
        GROUP BY oi.prepared_by
      `, ...values);

      const kitchenAgg = {};
      for (const row of kitchenRows) {
        kitchenAgg[row.userId] = {
          itemsPrepared: row.itemsPrepared,
          ordersInvolved: row.ordersInvolved,
          avgPrepMinutes: row.avgPrepMinutes,
        };
      }

      for (const user of users.filter((u) => u.role === "kitchen")) {
        const agg = kitchenAgg[user.id] || { itemsPrepared: 0, ordersInvolved: 0, avgPrepMinutes: null };
        results.push({
          user_id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          orders_completed: agg.itemsPrepared,
          avg_prep_time: agg.avgPrepMinutes,
        });
      }
    }

    return results;
  },

  /* ── Private Helpers ──────────────── */

  _buildWhereClause({ search, role, status }) {
    const clauses = [];

    if (search) {
      clauses.push({
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
        ],
      });
    }

    if (role && role !== "all") {
      clauses.push({ role });
    }

    if (status === "active") clauses.push({ isActive: true });
    else if (status === "inactive") clauses.push({ isActive: false });

    return clauses.length > 0 ? { AND: clauses } : {};
  },

  _buildOrderBy(sortBy, sortDir) {
    const fieldMap = {
      name: "name",
      email: "email",
      role: "role",
      isActive: "isActive",
      lastLoginAt: "lastLoginAt",
      createdAt: "createdAt",
    };
    return { [fieldMap[sortBy] || "name"]: sortDir || "asc" };
  },
};
