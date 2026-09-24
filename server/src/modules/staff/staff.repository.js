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
  async create({ name, email, role, passwordHash }) {
    return prisma.user.create({
      data: {
        name,
        email,
        role,
        passwordHash: passwordHash || "",
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
   * Headcounts for the Staff KPI row (admins excluded, like the table).
   */
  async getSummary() {
    const [byRole, active] = await Promise.all([
      prisma.user.groupBy({
        by: ["role"],
        where: { role: { not: "admin" } },
        _count: { _all: true },
      }),
      prisma.user.count({ where: { role: { not: "admin" }, isActive: true } }),
    ]);
    const count = (role) => byRole.find((r) => r.role === role)?._count._all ?? 0;
    const total = byRole.reduce((sum, r) => sum + r._count._all, 0);
    return {
      total,
      active,
      cashiers: count("cashier"),
      kitchen: count("kitchen"),
    };
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
