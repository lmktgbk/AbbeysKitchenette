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
            { processingBy: id },
            { completedBy: id },
            { nextInLineBy: id },
          ],
        },
      }),
    ]);
    return restockCount + lossCount + orderCount > 0;
  },

  /**
   * Get performance metrics for staff.
   */
  async getPerformance({ role, dateFrom, dateTo }) {
    const userWhere = role && role !== "all" ? { role } : {};
    const dateFilter = {};
    if (dateFrom) dateFilter.gte = new Date(dateFrom);
    if (dateTo) {
      const endDate = new Date(dateTo);
      endDate.setHours(23, 59, 59, 999);
      dateFilter.lte = endDate;
    }

    const dateCondition =
      Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {};

    const users = await prisma.user.findMany({
      where: userWhere,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
      },
      orderBy: { name: "asc" },
    });

    const userIds = users.map((u) => u.id);

    if (userIds.length === 0) return [];

    const orderWhere = {
      OR: [
        { createdBy: { in: userIds } },
        { acceptedBy: { in: userIds } },
        { processingBy: { in: userIds } },
        { completedBy: { in: userIds } },
        { nextInLineBy: { in: userIds } },
      ],
      ...dateCondition,
    };

    const orders = await prisma.order.findMany({
      where: orderWhere,
      select: {
        orderId: true,
        totalAmount: true,
        status: true,
        createdBy: true,
        acceptedBy: true,
        processingBy: true,
        completedBy: true,
        nextInLineBy: true,
        createdAt: true,
        completedAt: true,
        processingAt: true,
      },
    });

    const restockWhere = {
      restockedById: { in: userIds },
      ...(Object.keys(dateFilter).length > 0
        ? { restockedAt: dateFilter }
        : {}),
    };

    const lossWhere = {
      declaredById: { in: userIds },
      ...(Object.keys(dateFilter).length > 0
        ? { declaredAt: dateFilter }
        : {}),
    };

    const [restockCounts, lossCounts] = await Promise.all([
      prisma.restockBatch.groupBy({
        by: ["restockedById"],
        where: restockWhere,
        _count: true,
      }),
      prisma.lossRecord.groupBy({
        by: ["declaredById"],
        where: lossWhere,
        _count: true,
      }),
    ]);

    const restockMap = {};
    for (const r of restockCounts) restockMap[r.restockedById] = r._count;
    const lossMap = {};
    for (const l of lossCounts) lossMap[l.declaredById] = l._count;

    return users.map((user) => {
      const created = orders.filter((o) => o.createdBy === user.id);
      const accepted = orders.filter((o) => o.acceptedBy === user.id);
      const processed = orders.filter((o) => o.processingBy === user.id);
      const completed = orders.filter((o) => o.completedBy === user.id);
      const nextInLined = orders.filter((o) => o.nextInLineBy === user.id);

      const totalRevenue = created.reduce(
        (sum, o) => sum + Number(o.totalAmount),
        0
      );

      let avgCompletionMinutes = null;
      const completionTimes = completed
        .filter((o) => o.processingAt && o.completedAt)
        .map(
          (o) =>
            (new Date(o.completedAt) - new Date(o.processingAt)) / 60000
        );
      if (completionTimes.length > 0) {
        avgCompletionMinutes =
          completionTimes.reduce((a, b) => a + b, 0) / completionTimes.length;
      }

      return {
        user_id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        is_active: user.isActive,
        last_login_at: user.lastLoginAt,
        created_at: user.createdAt,
        orders_created: created.length,
        orders_accepted: accepted.length,
        orders_processed: processed.length,
        orders_completed: completed.length,
        orders_next_in_line: nextInLined.length,
        total_revenue: totalRevenue,
        avg_completion_minutes: avgCompletionMinutes
          ? Math.round(avgCompletionMinutes)
          : null,
        restocks_done: restockMap[user.id] || 0,
        losses_declared: lossMap[user.id] || 0,
      };
    });
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
