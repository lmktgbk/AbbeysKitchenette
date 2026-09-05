import { orderRepository } from "./order.repository.js";
import { isValidTransition, getNextStatus, formatOrderResponse, formatOrderItemResponse } from "./order.utils.js";
import { AppError } from "../../middleware/errorHandler.middleware.js";
import { productService } from "../products/product.service.js";
import prisma from "../../config/prisma.js";
import { auditLogService } from "../auditLogs/auditLog.service.js";
import { ACTIONS } from "../auditLogs/auditLog.constants.js";

/**
 * Order Service
 *
 * Business logic for order operations.
 * Validates status transitions, orchestrates deductions, manages queue.
 */

export const orderService = {
  /* ── Queries ─────────────────────────── */

  /**
   * Get paginated order list.
   * @param {object} params - { page, limit, search, status, dateFrom, dateTo, sortBy, sortDir }
   * @returns {{ orders: Array, totalItems: number }}
   */
  async getAll({ page = 1, limit = 50, search, status, dateFrom, dateTo, sortBy, sortDir }) {
    const skip = (page - 1) * limit;

    const [rows, totalItems] = await Promise.all([
      orderRepository.findManyPaginated({ skip, take: limit, search, status, dateFrom, dateTo, sortBy, sortDir }),
      orderRepository.countFiltered({ search, status, dateFrom, dateTo }),
    ]);

    const orders = rows.map((row) => formatOrderResponse(row, {
      creator_name: row.creator_name ?? null,
    }));

    return { orders, totalItems };
  },

  /**
   * Get status counts for KPI cards.
   * @returns {object} - counts per status
   */
  async getStats() {
    return orderRepository.countByStatus();
  },

  /**
   * Get single order with items.
   * @param {string} id - order UUID
   * @returns {object} - formatted order
   * @throws {AppError} 404 if not found
   */
  async getById(id) {
    const order = await orderRepository.findById(id);
    if (!order) throw new AppError(404, "Order not found", "ORDER_NOT_FOUND");

    return {
      ...formatOrderResponse(order),
      creator_name: order.creator?.name ?? null,
      accepted_by: order.acceptedByUser ? { name: order.acceptedByUser.name, role: order.acceptedByUser.role } : null,
      next_in_line_by: order.nextInLineByUser ? { name: order.nextInLineByUser.name, role: order.nextInLineByUser.role } : null,
      processing_by: order.processingByUser ? { name: order.processingByUser.name, role: order.processingByUser.role } : null,
      completed_by: order.completedByUser ? { name: order.completedByUser.name, role: order.completedByUser.role } : null,
      cancel_reason: order.cancellation?.reason ?? null,
      cancelled_at: order.cancellation?.cancelledAt ?? null,
      cancelled_by: order.cancellation?.cancelledByUser
        ? { name: order.cancellation.cancelledByUser.name, role: order.cancellation.cancelledByUser.role }
        : null,
      items: order.items.map((item) => formatOrderItemResponse({
        ...item,
        productName: item.product?.productName ?? null,
        sizeName: item.variant?.sizeName ?? null,
      })),
    };
  },

  /**
   * Get pending order for editing.
   * @param {string} id - order UUID
   * @returns {object} - order with items
   * @throws {AppError} 404 if not found or not pending
   */
  async getPendingById(id) {
    const order = await orderRepository.findPendingById(id);
    if (!order) throw new AppError(404, "Pending order not found", "ORDER_NOT_FOUND");
    return {
      ...formatOrderResponse(order),
      items: order.items.map((item) => formatOrderItemResponse({
        ...item,
        productName: item.product?.productName ?? null,
        sizeName: item.variant?.sizeName ?? null,
      })),
    };
  },

  /* ── Walk-In Order Creation ──────────── */

  /**
   * Create a walk-in order (auto-accepted, ingredients deducted immediately).
   * Everything runs in a single atomic transaction.
   * @param {object} data - { customerName, tableNumber, items, amountPaid, createdBy }
   * @returns {object} - created order
   * @throws {AppError} 400 if insufficient stock
   */
  async createWalkIn({ customerName, tableNumber, items, amountPaid, createdBy, orderDate: orderDateStr, ipAddress }) {
    // Step 1: Resolve recipes for all items and aggregate ingredient needs
    const aggregatedIngredients = await this._aggregateIngredientNeeds(items);
    const totalAmount = items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);

    // Step 2: Validate payment
    if (amountPaid < totalAmount) {
      throw new AppError(400, "Amount paid is less than total", "INSUFFICIENT_PAYMENT");
    }

    // Step 3: Run everything in a transaction
    const order = await prisma.$transaction(async (tx) => {
      // Generate order number
      const orderNumber = await orderRepository.getNextOrderNumber();
      const now = new Date();
      // Use client-provided date (user's local YYYY-MM-DD) or fallback to UTC today
      const orderDate = orderDateStr
        ? new Date(orderDateStr + "T00:00:00Z")
        : new Date(now.toISOString().split("T")[0]);

      // Create order (status: accepted)
      const newOrder = await orderRepository.createOrder({
        orderNumber,
        orderDate,
        customerName,
        tableNumber,
        orderSource: "walk_in",
        status: "accepted",
        totalAmount,
        amountPaid,
        change: amountPaid - totalAmount,
        createdBy,
        acceptedAt: now,
        acceptedBy: createdBy,
      }, items.map((item) => ({
        productId: item.product_id,
        variantId: item.variant_id,
        quantity: item.quantity,
        unitPrice: item.unit_price,
      })), tx);

      // Deduct ingredients (atomic — any failure rolls back entire order)
      const deductions = await this._deductIngredients(newOrder.orderId, aggregatedIngredients, tx);

      return { order: newOrder, deductions };
    });

    // Recompute variant availability for affected ingredients
    const affectedIngredientIds = [...aggregatedIngredients.keys()];
    await productService.recomputeVariantAvailability(affectedIngredientIds);

    // Auto-advance queue (accepted → next_in_line → processing)
    await this._advanceQueue();

    auditLogService.logAction({
      userId: createdBy,
      action: ACTIONS.ORDER_CREATED,
      targetType: "order",
      targetId: order.order.orderId,
      details: { total: totalAmount, source: "walk_in" },
      ipAddress,
    }).catch(() => {});

    return this.getById(order.order.orderId);
  },

  /* ── Online Order Creation (Guest) ──── */

  /**
   * Create an online order (status: pending, no deduction yet).
   * @param {object} data - { customerName, tableNumber, items, guestToken }
   * @returns {object} - created order
   */
  async createOnline({ customerName, tableNumber, items, guestToken, orderDate: orderDateStr }) {
    const totalAmount = items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);

    const result = await prisma.$transaction(async (tx) => {
      const orderNumber = await orderRepository.getNextOrderNumber();
      const now = new Date();
      const orderDate = orderDateStr
        ? new Date(orderDateStr + "T00:00:00Z")
        : new Date(now.toISOString().split("T")[0]);

      // Use raw SQL method to bypass Prisma's required `creator` relation.
      // The `created_by` column is nullable in the DB for guest/online orders.
      return orderRepository.createOnlineOrder({
        orderNumber,
        orderDate,
        customerName,
        tableNumber,
        totalAmount,
        guestToken,
      }, items.map((item) => ({
        productId: item.product_id,
        variantId: item.variant_id,
        quantity: item.quantity,
        unitPrice: item.unit_price,
      })), tx);
    });

    return this.getById(result.orderId);
  },


  /* ── Edit Pending Order ──────────────── */

  /**
   * Edit a pending order (items + name + table).
   * Recalculates total after changes.
   * @param {string} id - order UUID
   * @param {object} data - { customerName?, tableNumber?, items? }
   * @returns {object} - updated order
   */
  async editPending(id, data) {
    const existing = await orderRepository.findPendingById(id);
    if (!existing) throw new AppError(404, "Pending order not found", "ORDER_NOT_FOUND");
    if (existing.status !== "pending") {
      throw new AppError(400, "Only pending orders can be edited", "INVALID_STATUS");
    }

    return prisma.$transaction(async (tx) => {
      // Update order fields
      const updateData = {};
      if (data.customer_name !== undefined) updateData.customerName = data.customer_name;
      if (data.table_number !== undefined) updateData.tableNumber = data.table_number;

      if (Object.keys(updateData).length > 0) {
        await orderRepository.updateOrder(id, updateData, tx);
      }

      // Replace items if provided
      if (data.items) {
        await orderRepository.replaceItems(id, data.items.map((item) => ({
          productId: item.product_id,
          variantId: item.variant_id,
          quantity: item.quantity,
          unitPrice: item.unit_price,
        })), tx);

        // Recalculate total
        await orderRepository.recalculateTotal(id, tx);
      }

      return this.getById(id);
    });
  },

  /* ── Status Transitions ──────────────── */

  /**
   * Advance order to next status.
   * Validates transition, applies business rules, triggers auto-promotion.
   * @param {string} id - order UUID
   * @param {string} targetStatus - desired next status
   * @param {object} meta - { userId, amountPaid? }
   * @returns {object} - updated order
   */
  async advanceStatus(id, targetStatus, meta = {}) {
    const order = await orderRepository.findById(id);
    if (!order) throw new AppError(404, "Order not found", "ORDER_NOT_FOUND");

    // Validate transition is allowed
    if (!isValidTransition(order.status, targetStatus)) {
      throw new AppError(400, `Cannot move from "${order.status}" to "${targetStatus}"`, "INVALID_TRANSITION");
    }

    // Status-specific logic
    if (targetStatus === "accepted") {
      // Payment required for pending → accepted
      const result = await this._handleAcceptance(id, order, meta);
      auditLogService.logAction({
        userId: meta.userId,
        action: ACTIONS.ORDER_ACCEPTED,
        targetType: "order",
        targetId: id,
        ipAddress: meta.ipAddress,
      }).catch(() => {});
      return result;
    }

    // For other transitions, just update status
    await orderRepository.updateStatus(id, targetStatus, { userId: meta.userId });

    // Trigger auto-promotion
    await this._advanceQueue();

    if (targetStatus === "completed") {
      auditLogService.logAction({
        userId: meta.userId,
        action: ACTIONS.ORDER_COMPLETED,
        targetType: "order",
        targetId: id,
        ipAddress: meta.ipAddress,
      }).catch(() => {});
    }

    return this.getById(id);
  },

  /* ── Cancel / Delete ─────────────────── */

  /**
   * Cancel or delete an order based on status.
   * - pending: hard delete
   * - accepted / next_in_line: cancel + restore ingredients
   * - processing / completed: rejected
   * @param {string} id - order UUID
   * @param {string} userId - who is cancelling
   * @param {string} [reason] - cancellation reason
   * @returns {object} - deleted/cancelled order info
   */
  async cancelOrDelete(id, userId, reason, ipAddress) {
    const order = await orderRepository.findById(id);
    if (!order) throw new AppError(404, "Order not found", "ORDER_NOT_FOUND");

    // Pending → hard delete
    if (order.status === "pending") {
      await orderRepository.delete(id);
      auditLogService.logAction({
        userId,
        action: ACTIONS.ORDER_DELETED,
        targetType: "order",
        targetId: id,
        ipAddress,
      }).catch(() => {});
      return { order_id: id, action: "deleted" };
    }

    // Processing / completed → cannot cancel
    if (order.status === "processing" || order.status === "completed") {
      throw new AppError(400, `Cannot cancel an order in "${order.status}" status`, "INVALID_CANCELLATION");
    }

    // Accepted / next_in_line → cancel + restore ingredients
    const deductions = (order.status === "accepted" || order.status === "next_in_line")
      ? await orderRepository.getActiveDeductions(id)
      : [];
    const affectedIngredientIds = [...new Set(deductions.map((d) => d.ingredientId))];

    await prisma.$transaction(async (tx) => {
      // Restore ingredients if they were deducted
      if (order.status === "accepted" || order.status === "next_in_line") {
        await this._restoreIngredients(id, userId, tx);
      }

      // Update status to cancelled
      await orderRepository.updateStatus(id, "cancelled", { userId }, tx);

      // Create cancellation record
      await orderRepository.createCancellation({
        orderId: id,
        cancelledBy: userId,
        reason: reason || null,
      }, tx);
    });

    // Trigger auto-promotion (fill vacated queue slots)
    await this._advanceQueue();

    // Recompute variant availability for affected ingredients
    if (affectedIngredientIds.length > 0) {
      await productService.recomputeVariantAvailability(affectedIngredientIds);
    }

    auditLogService.logAction({
      userId,
      action: ACTIONS.ORDER_CANCELLED,
      targetType: "order",
      targetId: id,
      details: { reason: reason || null },
      ipAddress,
    }).catch(() => {});

    return { order_id: id, action: "cancelled" };
  },

  /* ── Ingredient Deduction Engine ─────── */

  /**
   * Aggregate ingredient needs across all order items.
   * @param {Array<object>} items - order items with product_id, variant_id, quantity, unit_price
   * @returns {Map<string, number>} - ingredientId → total quantity needed
   */
  async _aggregateIngredientNeeds(items) {
    const variantIds = [...new Set(items.map((item) => item.variant_id))];
    const recipes = await orderRepository.getRecipesByVariantIds(variantIds);

    // Build variantId → recipe map
    const recipeMap = new Map();
    for (const recipe of recipes) {
      if (!recipeMap.has(recipe.variantId)) recipeMap.set(recipe.variantId, []);
      recipeMap.get(recipe.variantId).push(recipe);
    }

    // Aggregate: for each item, multiply recipe quantities by item quantity
    const needs = new Map();
    for (const item of items) {
      const itemRecipes = recipeMap.get(item.variant_id) || [];
      for (const recipe of itemRecipes) {
        const key = recipe.ingredientId;
        const needed = Number(recipe.quantityNeeded) * item.quantity;
        needs.set(key, (needs.get(key) || 0) + needed);
      }
    }

    return needs;
  },

  /**
   * Deduct ingredients from batches using FIFO.
   * Stores deduction records for later reversal.
   * Rolls back if any ingredient has insufficient stock.
   * @param {string} orderId - order UUID
   * @param {Map<string, number>} needs - ingredientId → quantity needed
   * @param {object} tx - transaction client
   * @returns {Array<object>} - deduction records created
   * @throws {AppError} 400 if insufficient stock
   */
  async _deductIngredients(orderId, needs, tx) {
    const deductions = [];

    for (const [ingredientId, totalNeeded] of needs) {
      const batches = await orderRepository.getAvailableBatches(ingredientId, tx);
      let remaining = totalNeeded;

      for (const batch of batches) {
        if (remaining <= 0) break;

        const available = Number(batch.quantityLeft);
        const toDeduct = Math.min(remaining, available);

        // Try to deduct from this batch (optimistic locking)
        const updated = await orderRepository.deductBatch(batch.restockId, toDeduct, tx);
        if (!updated) {
          throw new AppError(400, "Insufficient ingredient stock (concurrent modification)", "INSUFFICIENT_STOCK");
        }

        deductions.push({
          orderId,
          ingredientId,
          restockBatchId: batch.restockId,
          quantityDeducted: toDeduct,
        });

        remaining -= toDeduct;
      }

      // Not enough stock across all batches
      if (remaining > 0) {
        throw new AppError(400, "Insufficient ingredient stock", "INSUFFICIENT_STOCK");
      }
    }

    // Store all deduction records
    if (deductions.length > 0) {
      await orderRepository.createDeductions(deductions, tx);
    }

    return deductions;
  },

  /**
   * Restore ingredients from deductions (on cancellation).
   * @param {string} orderId - order UUID
   * @param {string} userId - who is restoring
   * @param {object} tx - transaction client
   */
  async _restoreIngredients(orderId, userId, tx) {
    const deductions = await orderRepository.getActiveDeductions(orderId, tx);

    for (const deduction of deductions) {
      // Restore batch quantity
      await orderRepository.restoreBatch(deduction.restockBatchId, deduction.quantityDeducted, tx);
    }

    // Mark deductions as reversed
    await orderRepository.reverseDeductions(orderId, userId, tx);
  },

  /* ── Acceptance Handler ──────────────── */

  /**
   * Handle pending → accepted transition.
   * Deducts ingredients, validates payment, updates status.
   * @param {string} id - order UUID
   * @param {object} order - order record
   * @param {object} meta - { userId, amountPaid }
   * @returns {object} - updated order
   */
  async _handleAcceptance(id, order, meta) {
    if (!meta.amountPaid) {
      throw new AppError(400, "Amount paid is required for acceptance", "PAYMENT_REQUIRED");
    }

    if (meta.amountPaid < Number(order.totalAmount)) {
      throw new AppError(400, "Amount paid is less than total", "INSUFFICIENT_PAYMENT");
    }

    // Aggregate ingredient needs from order items
    const needs = new Map();
    for (const item of order.items) {
      const recipes = await orderRepository.getRecipesByVariantId(item.variantId);
      for (const recipe of recipes) {
        const key = recipe.ingredientId;
        const needed = Number(recipe.quantityNeeded) * item.quantity;
        needs.set(key, (needs.get(key) || 0) + needed);
      }
    }

    // Deduct ingredients + update status in single transaction
    await prisma.$transaction(async (tx) => {
      // Deduct ingredients (atomic — failure rolls back everything)
      await this._deductIngredients(id, needs, tx);

      // Update status
      await orderRepository.updateStatus(id, "accepted", {
        userId: meta.userId,
        amountPaid: meta.amountPaid,
        change: meta.amountPaid - Number(order.totalAmount),
      }, tx);
    });

    // Trigger auto-promotion after acceptance
    await this._advanceQueue();

    // Recompute variant availability for affected ingredients
    const affectedIngredientIds = [...needs.keys()];
    await productService.recomputeVariantAvailability(affectedIngredientIds);

    return this.getById(id);
  },

  /* ── Queue Auto-Promotion ────────────── */

  /**
   * Auto-advance queue after status changes.
   * Fills processing slot first, then next_in_line slot.
   * Runs after: creation, acceptance, cancellation, completion.
   */
  async _advanceQueue() {
    // Step 1: Fill processing slot if empty
    const processingCount = await orderRepository.countByStatusSingle("processing");
    if (processingCount === 0) {
      // Try to promote from next_in_line first
      let candidate = await orderRepository.findOldestByStatus("next_in_line");

      // If nothing in next_in_line, try from accepted (skip queue)
      if (!candidate) {
        candidate = await orderRepository.findOldestByStatus("accepted");
      }

      if (candidate) {
        // If promoted from accepted directly, also stamp nextInLineAt
        if (candidate.status === "accepted") {
          await orderRepository.updateStatus(candidate.orderId, "next_in_line");
        }
        await orderRepository.updateStatus(candidate.orderId, "processing");
      }
    }

    // Step 2: Fill next_in_line slot if empty
    const nextInLineCount = await orderRepository.countByStatusSingle("next_in_line");
    if (nextInLineCount === 0) {
      const candidate = await orderRepository.findOldestByStatus("accepted");
      if (candidate) {
        await orderRepository.updateStatus(candidate.orderId, "next_in_line");
      }
    }
  },
};
