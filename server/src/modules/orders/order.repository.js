import { randomUUID } from "crypto";
import prisma from "../../config/prisma.js";

/**
 * Order Repository
 *
 * All database queries for orders.
 * Uses $queryRawUnsafe for complex queries, Prisma client for simple CRUD.
 * Follows the existing codebase pattern (object export, plain SQL helpers).
 */
export const orderRepository = {
  /* ── Order Counter ─────────────────────── */

  /**
   * Get next order number for today (atomic).
   * Uses INSERT ... ON CONFLICT to safely increment.
   * @returns {number} - next order number
   */
  async getNextOrderNumber() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const result = await prisma.$queryRaw`
      INSERT INTO order_counters (date, counter)
      VALUES (${today}::date, 1)
      ON CONFLICT (date) DO UPDATE
      SET counter = order_counters.counter + 1
      RETURNING counter
    `;
    return Number(result[0].counter);
  },

  /* ── CRUD ──────────────────────────────── */

  /**
   * Create order with items inside a transaction.
   * @param {object} data - order data
   * @param {Array<object>} items - order items
   * @param {object} tx - Prisma transaction client
   * @returns {object} - created order
   */
  async createOrder(data, items, tx) {
    const client = tx || prisma;

    const order = await client.order.create({
      data: {
        orderNumber: data.orderNumber,
        orderDate: data.orderDate,
        customerName: data.customerName,
        tableNumber: data.tableNumber,
        orderSource: data.orderSource,
        status: data.status,
        totalAmount: data.totalAmount,
        amountPaid: data.amountPaid ?? null,
        change: data.change ?? null,
        guestToken: data.guestToken ?? null,
        createdBy: data.createdBy,
        acceptedAt: data.acceptedAt ?? null,
        acceptedBy: data.acceptedBy ?? null,
        items: {
          create: items.map((item) => ({
            productId: item.productId,
            variantId: item.variantId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            subtotal: item.unitPrice * item.quantity,
          })),
        },
      },
      include: { items: true },
    });

    return order;
  },

  /**
   * Create an online (guest) order using raw SQL.
   * This bypasses Prisma's required-relation validation for `creator`
   * so that guest orders can be created without a `created_by` user.
   * @param {object} data - order data
   * @param {Array<object>} items - order items
   * @param {object} tx - Prisma transaction client
   * @returns {{ orderId: string }} - created order ID
   */
  async createOnlineOrder(data, items, tx) {
    const client = tx || prisma;
    const orderId = randomUUID();

    // Insert the order row via raw SQL — omits created_by entirely so the
    // DB uses its column default (NULL, now that we ran db push).
    await client.$executeRaw`
      INSERT INTO orders (
        order_id, order_number, order_date, customer_name, table_number,
        order_source, status, total_amount, guest_token,
        created_at, updated_at
      )
      VALUES (
        ${orderId}::uuid,
        ${data.orderNumber},
        ${data.orderDate}::date,
        ${data.customerName},
        ${data.tableNumber},
        'online'::"order_source_enum",
        'pending'::"order_status_enum",
        ${data.totalAmount},
        ${data.guestToken}::uuid,
        now(), now()
      )
    `;

    // Create order items using Prisma (these have no optional-relation issues)
    await client.orderItem.createMany({
      data: items.map((item) => ({
        orderId,
        productId: item.productId,
        variantId: item.variantId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        subtotal: item.unitPrice * item.quantity,
      })),
    });

    return { orderId };
  },


  /**
   * Find order by ID with items and creator.
   * @param {string} id - order UUID
   * @returns {object|null} - order or null
   */
  async findById(id) {
    return prisma.order.findUnique({
      where: { orderId: id },
      include: {
        items: {
          include: {
            product: { select: { productName: true } },
            variant: { select: { sizeName: true } },
          },
        },
        creator: { select: { id: true, name: true, role: true } },
        acceptedByUser: { select: { id: true, name: true, role: true } },
        nextInLineByUser: { select: { id: true, name: true, role: true } },
        processingByUser: { select: { id: true, name: true, role: true } },
        completedByUser: { select: { id: true, name: true, role: true } },
        cancellation: {
          include: { cancelledByUser: { select: { id: true, name: true, role: true } } },
        },
      },
    });
  },

  /**
   * Find order by guest token (public API).
   * @param {string} token - guest UUID
   * @returns {object|null} - order or null
   */
  async findByGuestToken(token) {
    return prisma.order.findUnique({
      where: { guestToken: token },
      include: {
        items: {
          include: {
            product: { select: { productName: true } },
            variant: { select: { sizeName: true } },
          },
        },
      },
    });
  },

  /**
   * Find pending order by ID (for editing).
   * @param {string} id - order UUID
   * @returns {object|null} - order with items or null
   */
  async findPendingById(id) {
    return prisma.order.findFirst({
      where: { orderId: id, status: "pending" },
      include: {
        items: {
          include: {
            product: { select: { productName: true } },
            variant: { select: { sizeName: true } },
          },
        },
      },
    });
  },

  /**
   * Paginated order list with search, status, date, and sort filters.
   * Uses $queryRawUnsafe for complex filtering.
   * @param {object} params - { skip, take, search, status, dateFrom, dateTo, sortBy, sortDir }
   * @returns {Array} - rows with order + item_count
   */
  async findManyPaginated({ skip, take, search, status, dateFrom, dateTo, sortBy, sortDir }) {
    const { where, values } = this._buildOrderWhereClause(search, status, dateFrom, dateTo);
    const orderClause = this._buildOrderOrderByClause(sortBy, sortDir);

    const sql = `
      SELECT
        o.order_id, o.order_number, o.customer_name, o.table_number,
        o.order_source, o.status, o.total_amount, o.amount_paid, o.change,
        o.guest_token,
        o.accepted_at, o.accepted_by, o.next_in_line_at,
        o.processing_at, o.processing_by, o.completed_at, o.completed_by,
        o.created_by, o.created_at, o.updated_at,
        u.name AS creator_name,
        COUNT(*) OVER() AS total_count
      FROM orders o
      LEFT JOIN "User" u ON u.id = o.created_by
      ${where}
      ORDER BY ${orderClause}
      LIMIT $${values.length + 1} OFFSET $${values.length + 2}
    `;

    values.push(take, skip);
    return prisma.$queryRawUnsafe(sql, ...values);
  },

  /**
   * Count orders matching filters.
   * @param {object} params - { search, status, dateFrom, dateTo }
   * @returns {number} - total count
   */
  async countFiltered({ search, status, dateFrom, dateTo }) {
    const { where, values } = this._buildOrderWhereClause(search, status, dateFrom, dateTo);
    const sql = `SELECT COUNT(*)::int AS count FROM orders o ${where}`;
    const result = await prisma.$queryRawUnsafe(sql, ...values);
    return result[0]?.count ?? 0;
  },

  /**
   * Get status counts for KPI cards.
   * @returns {object} - { pending, accepted, next_in_line, processing, completed, cancelled }
   */
  async countByStatus() {
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

  /* ── Status Management ─────────────────── */

  /**
   * Update order status with timestamp and actor.
   * @param {string} id - order UUID
   * @param {string} status - new status
   * @param {object} [meta] - { userId, amountPaid, change }
   * @param {object} [tx] - transaction client
   * @returns {object} - updated order
   */
  async updateStatus(id, status, meta = {}, tx) {
    const client = tx || prisma;

    const data = { status };

    // Stamp the appropriate timestamp + actor
    if (status === "accepted") {
      data.acceptedAt = new Date();
      data.acceptedBy = meta.userId;
      if (meta.amountPaid !== undefined) data.amountPaid = meta.amountPaid;
      if (meta.change !== undefined) data.change = meta.change;
    } else if (status === "next_in_line") {
      data.nextInLineAt = new Date();
      if (meta.userId) data.nextInLineBy = meta.userId;
    } else if (status === "processing") {
      data.processingAt = new Date();
      data.processingBy = meta.userId;
    } else if (status === "completed") {
      data.completedAt = new Date();
      data.completedBy = meta.userId;
    }

    return client.order.update({
      where: { orderId: id },
      data,
    });
  },

  /**
   * Update order details (pending only).
   * @param {string} id - order UUID
   * @param {object} data - { customerName?, tableNumber? }
   * @param {object} [tx] - transaction client
   * @returns {object} - updated order
   */
  async updateOrder(id, data, tx) {
    const client = tx || prisma;
    return client.order.update({
      where: { orderId: id },
      data,
    });
  },

  /**
   * Replace order items (pending only, inside transaction).
   * Deletes existing items and creates new ones.
   * @param {string} orderId - order UUID
   * @param {Array<object>} items - new items
   * @param {object} tx - transaction client
   */
  async replaceItems(orderId, items, tx) {
    await tx.orderItem.deleteMany({ where: { orderId } });
    await tx.orderItem.createMany({
      data: items.map((item) => ({
        orderId,
        productId: item.productId,
        variantId: item.variantId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        subtotal: item.unitPrice * item.quantity,
      })),
    });
  },

  /**
   * Recalculate order total from items.
   * @param {string} orderId - order UUID
   * @param {object} tx - transaction client
   * @returns {object} - updated order
   */
  async recalculateTotal(orderId, tx) {
    const client = tx || prisma;
    const items = await client.orderItem.findMany({ where: { orderId } });
    const total = items.reduce((sum, item) => sum + Number(item.subtotal || 0), 0);
    return client.order.update({
      where: { orderId },
      data: { totalAmount: total },
    });
  },

  /**
   * Hard delete order (cascade removes items).
   * @param {string} id - order UUID
   * @param {object} [tx] - transaction client
   */
  async delete(id, tx) {
    const client = tx || prisma;
    return client.order.delete({ where: { orderId: id } });
  },

  /* ── Queue Management ──────────────────── */

  /**
   * Count orders with a given status.
   * @param {string} status - order status
   * @returns {number} - count
   */
  async countByStatusSingle(status) {
    const result = await prisma.$queryRaw`
      SELECT COUNT(*)::int AS count FROM orders WHERE status = ${status}
    `;
    return result[0]?.count ?? 0;
  },

  /**
   * Find oldest order by status (for auto-promotion).
   * @param {string} status - order status
   * @returns {object|null} - order or null
   */
  async findOldestByStatus(status) {
    // Map status to its timestamp field for FIFO ordering
    const tsField = {
      accepted: "accepted_at",
      next_in_line: "next_in_line_at",
      processing: "processing_at",
    }[status] || "created_at";

    const result = await prisma.$queryRawUnsafe(`
      SELECT order_id FROM orders
      WHERE status = $1
      ORDER BY ${tsField} ASC
      LIMIT 1
    `, status);

    if (!result[0]) return null;
    return this.findById(result[0].order_id);
  },

  /* ── Ingredient Deductions ─────────────── */

  /**
   * Store deduction records (inside transaction).
   * @param {Array<object>} deductions - [{ orderId, ingredientId, restockBatchId, quantityDeducted }]
   * @param {object} tx - transaction client
   */
  async createDeductions(deductions, tx) {
    if (deductions.length === 0) return;
    await tx.orderIngredientDeduction.createMany({ data: deductions });
  },

  /**
   * Get active deductions for an order (not yet reversed).
   * @param {string} orderId - order UUID
   * @param {object} [tx] - transaction client
   * @returns {Array<object>} - deduction records
   */
  async getActiveDeductions(orderId, tx) {
    const client = tx || prisma;
    return client.orderIngredientDeduction.findMany({
      where: { orderId, reversedAt: null },
    });
  },

  /**
   * Mark deductions as reversed (inside transaction).
   * @param {string} orderId - order UUID
   * @param {string} userId - who reversed
   * @param {object} tx - transaction client
   */
  async reverseDeductions(orderId, userId, tx) {
    await tx.orderIngredientDeduction.updateMany({
      where: { orderId, reversedAt: null },
      data: { reversedAt: new Date(), reversedBy: userId },
    });
  },

  /* ── Batch Operations ─────────────────── */

  /**
   * Deduct stock from a restock batch (FIFO, with version check).
   * @param {number} batchId - restock batch ID
   * @param {number} quantity - amount to deduct
   * @param {object} tx - transaction client
   * @returns {object|null} - updated batch or null if insufficient
   */
  async deductBatch(batchId, quantity, tx) {
    const client = tx || prisma;

    // Optimistic locking: check version and stock
    const batch = await client.restockBatch.findUnique({ where: { restockId: batchId } });
    if (!batch || Number(batch.quantityLeft) < Number(quantity)) {
      return null;
    }

    return client.restockBatch.update({
      where: {
        restockId: batchId,
        version: batch.version, // optimistic lock
      },
      data: {
        quantityLeft: { decrement: quantity },
        version: { increment: 1 },
      },
    });
  },

  /**
   * Restore stock to a restock batch.
   * @param {number} batchId - restock batch ID
   * @param {number} quantity - amount to restore
   * @param {object} tx - transaction client
   */
  async restoreBatch(batchId, quantity, tx) {
    const client = tx || prisma;
    return client.restockBatch.update({
      where: { restockId: batchId },
      data: {
        quantityLeft: { increment: quantity },
        version: { increment: 1 },
      },
    });
  },

  /**
   * Get available batches for an ingredient (FIFO order: priority first, then oldest).
   * @param {string} ingredientId - ingredient UUID
   * @param {object} tx - transaction client
   * @returns {Array<object>} - batches with quantityLeft > 0
   */
  async getAvailableBatches(ingredientId, tx) {
    const client = tx || prisma;
    return client.restockBatch.findMany({
      where: {
        ingredientId,
        quantityLeft: { gt: 0 },
      },
      orderBy: [
        { isPriority: "desc" },
        { restockedAt: "asc" },
      ],
    });
  },

  /**
   * Get recipe for a variant (ingredients + quantities needed).
   * @param {number} variantId - variant ID
   * @returns {Array<object>} - recipe entries
   */
  async getRecipesByVariantId(variantId) {
    return prisma.recipe.findMany({
      where: { variantId },
    });
  },

  /**
   * Get recipes for multiple variants at once.
   * @param {number[]} variantIds - array of variant IDs
   * @returns {Array<object>} - recipe entries with variantId
   */
  async getRecipesByVariantIds(variantIds) {
    if (variantIds.length === 0) return [];
    return prisma.recipe.findMany({
      where: { variantId: { in: variantIds } },
    });
  },

  /**
   * Create cancellation record.
   * @param {object} data - { orderId, cancelledBy, reason }
   * @param {object} tx - transaction client
   */
  async createCancellation(data, tx) {
    const client = tx || prisma;
    return client.orderCancellation.create({ data });
  },

  /* ── SQL Builder Helpers ───────────────── */

  /**
   * Build WHERE clause for order queries.
   * @param {string} search - search term
   * @param {string} status - status filter
   * @param {string} dateFrom - start date (YYYY-MM-DD)
   * @param {string} dateTo - end date (YYYY-MM-DD)
   * @returns {{ where: string, values: Array }}
   */
  _buildOrderWhereClause(search, status, dateFrom, dateTo) {
    const clauses = [];
    const values = [];
    let idx = 1;

    if (search) {
      values.push(`%${search}%`);
      clauses.push(`(o.customer_name ILIKE $${idx} OR CAST(o.order_number AS TEXT) LIKE $${idx})`);
      idx++;
    }

    if (status && status !== "all") {
      clauses.push(`o.status = $${idx++}`);
      values.push(status);
    }

    if (dateFrom) {
      clauses.push(`o.order_date >= $${idx++}::date`);
      values.push(dateFrom);
    }

    if (dateTo) {
      clauses.push(`o.order_date <= $${idx++}::date`);
      values.push(dateTo);
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    return { where, values };
  },

  /**
   * Build ORDER BY clause for order queries.
   * @param {string} sortBy - sort column
   * @param {string} sortDir - sort direction
   * @returns {string} - SQL ORDER BY fragment
   */
  _buildOrderOrderByClause(sortBy, sortDir) {
    const columnMap = {
      order_number: "o.order_number",
      customer_name: "o.customer_name",
      total_amount: "o.total_amount",
      created_at: "o.created_at",
      status: "o.status",
    };
    const col = columnMap[sortBy] || "o.created_at";
    const dir = sortDir === "asc" ? "ASC" : "DESC";
    return `${col} ${dir}`;
  },
};
