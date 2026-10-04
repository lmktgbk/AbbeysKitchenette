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
  async findById(id, tx = prisma) {
    return tx.user.findUnique({
      where: { id },
      select: SAFE_SELECT,
    });
  },

  /**
   * Find staff by email.
   */
  async findByEmail(email, tx = prisma) {
    return tx.user.findUnique({
      where: { email },
      select: { id: true, email: true },
    });
  },

  /**
   * Create a new staff member.
   */
  async create({ name, email, role, passwordHash }, tx = prisma) {
    return tx.user.create({
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
  async update(id, data, tx = prisma) {
    const user = await tx.user.update({
      where: { id },
      data: { ...data, sessionVersion: { increment: 1 } },
      select: SAFE_SELECT,
    });
    return user;
  },

  /**
   * Toggle active status.
   */
  async setActive(id, isActive, tx = prisma) {
    const user = await tx.user.update({
      where: { id },
      data: { isActive, sessionVersion: { increment: 1 } },
      select: { id: true, isActive: true },
    });
    return user;
  },

  /**
   * Hard delete staff.
   */
  async deleteUser(id, tx = prisma) {
    const user = await tx.user.delete({
      where: { id },
      select: { id: true, name: true },
    });
    return user;
  },

  /**
   * Check if staff has transaction history (restock, loss, orders).
   */
  async hasTransactions(id, tx = prisma) {
    const [row] = await tx.$queryRaw`
      SELECT EXISTS (SELECT 1 FROM restock_batches WHERE restocked_by = ${id}::uuid)
        OR EXISTS (SELECT 1 FROM loss_records WHERE declared_by = ${id}::uuid OR overridden_by = ${id}::uuid)
        OR EXISTS (SELECT 1 FROM stock_adjustments WHERE adjusted_by = ${id}::uuid)
        OR EXISTS (SELECT 1 FROM orders WHERE created_by = ${id}::uuid OR accepted_by = ${id}::uuid
          OR preparing_by = ${id}::uuid OR completed_by = ${id}::uuid)
        OR EXISTS (SELECT 1 FROM order_items WHERE prepared_by = ${id}::uuid OR removed_by = ${id}::uuid)
        OR EXISTS (SELECT 1 FROM order_cancellations WHERE cancelled_by = ${id}::uuid)
        OR EXISTS (SELECT 1 FROM payment_refunds WHERE refunded_by = ${id}::uuid)
        OR EXISTS (SELECT 1 FROM audit_logs WHERE "userId" = ${id}::uuid)
        OR EXISTS (SELECT 1 FROM shifts WHERE opened_by = ${id}::uuid OR closed_by = ${id}::uuid)
        AS has_history
    `;
    return row.has_history;

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
