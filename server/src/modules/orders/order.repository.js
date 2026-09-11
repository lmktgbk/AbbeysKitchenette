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
        preparingByUser: { select: { id: true, name: true, role: true } },
        completedByUser: { select: { id: true, name: true, role: true } },
        cancellation: {
          include: { cancelledByUser: { select: { id: true, name: true, role: true } } },
        },
        refund: {
          include: { refundedByUser: { select: { id: true, name: true, role: true } } },
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
  async findManyPaginated({ skip, take, search, status, dateFrom, dateTo, sortBy, sortDir, staffId }) {
    const { where, values } = this._buildOrderWhereClause(search, status, dateFrom, dateTo, staffId);
    const orderClause = this._buildOrderOrderByClause(sortBy, sortDir);

    const sql = `
      SELECT
        o.order_id, o.order_number, o.customer_name, o.table_number,
        o.order_source, o.status, o.total_amount, o.amount_paid, o.change,
        o.guest_token,
        o.accepted_at, o.accepted_by,
        o.preparing_at, o.preparing_by,
        o.completed_at, o.completed_by,
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
  async countFiltered({ search, status, dateFrom, dateTo, staffId }) {
    const { where, values } = this._buildOrderWhereClause(search, status, dateFrom, dateTo, staffId);
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

    const counts = { pending: 0, accepted: 0, preparing: 0, completed: 0, cancelled: 0 };
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
    } else if (status === "preparing") {
      data.preparingAt = new Date();
      data.preparingBy = meta.userId;
    } else if (status === "completed") {
      data.completedAt = new Date();
      data.completedBy = meta.userId;
      if (meta.fulfillmentMinutes !== undefined) data.fulfillmentMinutes = meta.fulfillmentMinutes;
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

  /* ── Order Item Preparation ───────────── */

  async setOrderItemPrepared(orderItemId, isPrepared, userId, tx) {
    const client = tx || prisma;
    return client.orderItem.update({
      where: { orderItemId },
      data: {
        isPrepared,
        preparedBy: isPrepared ? userId : null,
        preparedAt: isPrepared ? new Date() : null,
      },
    });
  },

  async getOrderItems(orderId) {
    return prisma.orderItem.findMany({
      where: { orderId },
      include: {
        product: { select: { productName: true } },
        variant: { select: { sizeName: true } },
        preparedByUser: { select: { name: true, role: true } },
      },
    });
  },

  /**
   * Get a single order item by ID with order relation.
   * @param {number} orderItemId - order item integer ID
   * @returns {object|null} - order item or null
   */
  async getOrderItemById(orderItemId) {
    return prisma.orderItem.findUnique({
      where: { orderItemId },
      include: {
        order: { select: { orderId: true, status: true, amountPaid: true } },
        product: { select: { productName: true } },
        variant: { select: { sizeName: true } },
      },
    });
  },

  /**
   * Hard-delete a single order item.
   * @param {number} orderItemId - order item integer ID
   * @param {object} [tx] - transaction client
   */
  async deleteOrderItem(orderItemId, tx) {
    const client = tx || prisma;
    return client.orderItem.delete({ where: { orderItemId } });
  },

  /**
   * Count order items.
   * @param {string} orderId - order UUID
   * @param {object} [tx] - transaction client
   * @returns {number} - item count
   */
  async countOrderItems(orderId, tx) {
    const client = tx || prisma;
    return client.orderItem.count({ where: { orderId } });
  },

  /* ── Loss Records ─────────────────────── */

  async getOrderItemLosses(orderId) {
    return prisma.lossRecord.findMany({
      where: { relatedOrderId: orderId },
    });
  },

  async createOrderItemLoss(data, tx) {
    const client = tx || prisma;
    return client.lossRecord.create({ data });
  },

  async overrideLoss(lossId, { overrideReason, overrideNote, overriddenById }, tx) {
    const client = tx || prisma;
    return client.lossRecord.update({
      where: { lossId },
      data: {
        overrideReason,
        overrideNote,
        overriddenById,
        overriddenAt: new Date(),
      },
    });
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
      include: { batch: { select: { costPerUnit: true } } },
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

  /**
   * Get weighted cost per ingredient from deduction records.
   * Returns the actual cost that was charged when ingredients were deducted.
   * @param {string} orderId - order UUID
   * @returns {Array<object>} - [{ ingredient_id, ingredient_name, unit, weighted_cost_per_unit }]
   */
  async getDeductionIngredientCosts(orderId) {
    const sql = `
      SELECT
        d.ingredient_id,
        i.ingredient_name,
        i.unit,
        SUM(d.quantity_deducted) AS total_deducted,
        CASE WHEN SUM(d.quantity_deducted) > 0
          THEN SUM(d.quantity_deducted * b.cost_per_unit) / SUM(d.quantity_deducted)
          ELSE 0
        END AS weighted_cost_per_unit
      FROM order_ingredient_deductions d
      JOIN ingredients i ON i.ingredient_id = d.ingredient_id
      JOIN restock_batches b ON b.restock_id = d.restock_batch_id
      WHERE d.order_id = $1 AND d.reversed_at IS NULL
      GROUP BY d.ingredient_id, i.ingredient_name, i.unit
    `;
    return prisma.$queryRawUnsafe(sql, orderId);
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
      include: { ingredient: { select: { ingredientName: true, unit: true } } },
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

  async createRefund(data, tx) {
    const client = tx || prisma;
    return client.paymentRefund.create({ data });
  },

  /* ── Kitchen Display ───────────────────── */

  /**
   * Get kitchen display orders with items in a single query.
   * Uses json_agg to nest order_items under each order.
   * Filters for active + today's completed orders only.
   * @returns {Array} - orders with items array
   */
  async findKitchenOrders() {
    const sql = `
      SELECT
        o.order_id, o.order_number, o.customer_name, o.table_number,
        o.order_source, o.status, o.total_amount,
        o.accepted_at, o.accepted_by,
        o.preparing_at, o.preparing_by,
        o.completed_at, o.completed_by,
        o.created_by, o.created_at, o.updated_at,
        COALESCE(
          json_agg(
            json_build_object(
              'order_item_id', oi.order_item_id,
              'product_id', oi.product_id,
              'product_name', p.product_name,
              'variant_id', oi.variant_id,
              'size_name', v.size_name,
              'quantity', oi.quantity,
              'unit_price', oi.unit_price,
              'is_prepared', oi.is_prepared,
              'prepared_by_name', u_prep.name,
              'prepared_by_role', u_prep.role,
              'prepared_at', oi.prepared_at,
              'category_id', c.category_id,
              'category_name', c.category_name,
              'subcategory_id', sc.subcategory_id,
              'subcategory_name', sc.subcategory_name
            )
          ) FILTER (WHERE oi.order_item_id IS NOT NULL),
          '[]'
        ) AS items
      FROM orders o
      LEFT JOIN order_items oi ON oi.order_id = o.order_id
      LEFT JOIN products p ON p.product_id = oi.product_id
      LEFT JOIN product_variants v ON v.variant_id = oi.variant_id
      LEFT JOIN subcategories sc ON sc.subcategory_id = p.subcategory_id
      LEFT JOIN categories c ON c.category_id = sc.category_id
      LEFT JOIN "User" u_prep ON u_prep.id = oi.prepared_by
      WHERE (
            o.status IN ('accepted','preparing')
            OR (o.status = 'completed' AND o.completed_at >= (CURRENT_DATE - INTERVAL '1 day'))
          )
      GROUP BY o.order_id
      ORDER BY
        CASE o.status
          WHEN 'preparing' THEN 1
          WHEN 'accepted' THEN 2
          WHEN 'completed' THEN 3
        END,
        o.created_at ASC
    `;
    return prisma.$queryRawUnsafe(sql);
  },

  /**
   * Find batch preparation groups for preparing orders.
   * Groups order items by product+variant so kitchen can batch-cook.
   */
  async findBatchGroups() {
    const sql = `
      SELECT
        p.product_id,
        p.product_name,
        v.variant_id,
        v.size_name,
        SUM(oi.quantity) AS total_quantity,
        json_agg(
          json_build_object(
            'order_id', o.order_id,
            'order_number', o.order_number,
            'quantity', oi.quantity,
            'order_item_id', oi.order_item_id,
            'is_prepared', oi.is_prepared
          )
          ORDER BY o.order_number
        ) AS orders
      FROM order_items oi
      JOIN orders o ON o.order_id = oi.order_id
      JOIN products p ON p.product_id = oi.product_id
      JOIN product_variants v ON v.variant_id = oi.variant_id
      WHERE o.status = 'preparing'
        AND oi.is_prepared = false
      GROUP BY p.product_id, p.product_name, v.variant_id, v.size_name
      ORDER BY p.product_name, v.size_name
    `;
    return prisma.$queryRawUnsafe(sql);
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
  _buildOrderWhereClause(search, status, dateFrom, dateTo, staffId) {
    const clauses = [];
    const values = [];
    let idx = 1;

    if (search) {
      values.push(`%${search}%`);
      clauses.push(`(o.customer_name ILIKE $${idx} OR CAST(o.order_number AS TEXT) LIKE $${idx})`);
      idx++;
    }

    if (status && status !== "all") {
      const statuses = status.split(",").map((s) => s.trim()).filter(Boolean);
      if (statuses.length === 1) {
        clauses.push(`o.status = $${idx++}`);
        values.push(statuses[0]);
      } else if (statuses.length > 1) {
        const placeholders = statuses.map(() => `$${idx++}`).join(", ");
        clauses.push(`o.status IN (${placeholders})`);
        values.push(...statuses);
      }
    }

    if (dateFrom) {
      clauses.push(`o.order_date >= $${idx++}::date`);
      values.push(dateFrom);
    }

    if (dateTo) {
      clauses.push(`o.order_date <= $${idx++}::date`);
      values.push(dateTo);
    }

    if (staffId) {
      clauses.push(`(o.created_by = $${idx} OR o.completed_by = $${idx})`);
      values.push(staffId);
      idx++;
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
