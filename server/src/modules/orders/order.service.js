import { orderRepository } from "./order.repository.js";
import { isValidTransition, formatOrderResponse, formatOrderItemResponse } from "./order.utils.js";
import { AppError } from "../../middleware/errorHandler.middleware.js";
import { productService } from "../products/product.service.js";
import prisma from "../../config/prisma.js";
import { auditLogService } from "../auditLogs/auditLog.service.js";
import { ACTIONS } from "../auditLogs/auditLog.constants.js";

export const orderService = {
  /* ── Queries ─────────────────────────── */

  async getAll({ page = 1, limit = 50, search, status, dateFrom, dateTo, sortBy, sortDir, staffId }) {
    const skip = (page - 1) * limit;

    const [rows, totalItems] = await Promise.all([
      orderRepository.findManyPaginated({ skip, take: limit, search, status, dateFrom, dateTo, sortBy, sortDir, staffId }),
      orderRepository.countFiltered({ search, status, dateFrom, dateTo, staffId }),
    ]);

    const orders = rows.map((row) => formatOrderResponse(row, {
      creator_name: row.creator_name ?? null,
    }));

    return { orders, totalItems };
  },

  async getKitchenOrders() {
    const rows = await orderRepository.findKitchenOrders();

    const orders = rows.map((row) => {
      const items = Array.isArray(row.items)
        ? row.items.map((item) => formatOrderItemResponse(item))
        : [];
      return {
        ...formatOrderResponse(row),
        items,
      };
    });

    return { orders };
  },

  /**
   * Get batch preparation groups for preparing orders.
   * Groups unchecked items by product+variant so kitchen can batch-cook.
   */
  async getBatchGroups() {
    const rows = await orderRepository.findBatchGroups();

    return rows.map((row) => ({
      product_id: row.product_id,
      product_name: row.product_name,
      variant_id: row.variant_id,
      size_name: row.size_name,
      total_quantity: Number(row.total_quantity),
      orders: row.orders.map((o) => ({
        order_id: o.order_id,
        order_number: o.order_number,
        quantity: o.quantity,
        order_item_id: o.order_item_id,
        is_prepared: o.is_prepared,
      })),
    }));
  },

  async getStats() {
    return orderRepository.countByStatus();
  },

  async getById(id) {
    const order = await orderRepository.findById(id);
    if (!order) throw new AppError(404, "Order not found", "ORDER_NOT_FOUND");

    return {
      ...formatOrderResponse(order),
      creator_name: order.creator?.name ?? null,
      accepted_by: order.acceptedByUser ? { name: order.acceptedByUser.name, role: order.acceptedByUser.role } : null,
      preparing_by: order.preparingByUser ? { name: order.preparingByUser.name, role: order.preparingByUser.role } : null,
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

  async createWalkIn({ customerName, tableNumber, items, amountPaid, createdBy, orderDate: orderDateStr }) {
    const aggregatedIngredients = await this._aggregateIngredientNeeds(items);
    const totalAmount = items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);

    if (amountPaid < totalAmount) {
      throw new AppError(400, "Amount paid is less than total", "INSUFFICIENT_PAYMENT");
    }

    const order = await prisma.$transaction(async (tx) => {
      const orderNumber = await orderRepository.getNextOrderNumber();
      const now = new Date();
      const orderDate = orderDateStr
        ? new Date(orderDateStr + "T00:00:00Z")
        : new Date(now.toISOString().split("T")[0]);

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

      const deductions = await this._deductIngredients(newOrder.orderId, aggregatedIngredients, tx);
      return { order: newOrder, deductions };
    });

    const affectedIngredientIds = [...aggregatedIngredients.keys()];
    await productService.recomputeVariantAvailability(affectedIngredientIds);

    auditLogService.logAction({
      userId: createdBy,
      action: ACTIONS.ORDER_CREATED,
      targetType: "order",
      targetId: order.order.orderId,
      details: { total: totalAmount, source: "walk_in" },
    }).catch(() => {});

    return this.getById(order.order.orderId);
  },

  /* ── Online Order Creation (Guest) ──── */

  async createOnline({ customerName, tableNumber, items, guestToken, orderDate: orderDateStr }) {
    const totalAmount = items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);

    const result = await prisma.$transaction(async (tx) => {
      const orderNumber = await orderRepository.getNextOrderNumber();
      const now = new Date();
      const orderDate = orderDateStr
        ? new Date(orderDateStr + "T00:00:00Z")
        : new Date(now.toISOString().split("T")[0]);

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

  async editPending(id, data) {
    const existing = await orderRepository.findPendingById(id);
    if (!existing) throw new AppError(404, "Pending order not found", "ORDER_NOT_FOUND");
    if (existing.status !== "pending") {
      throw new AppError(400, "Only pending orders can be edited", "INVALID_STATUS");
    }

    return prisma.$transaction(async (tx) => {
      const updateData = {};
      if (data.customer_name !== undefined) updateData.customerName = data.customer_name;
      if (data.table_number !== undefined) updateData.tableNumber = data.table_number;

      if (Object.keys(updateData).length > 0) {
        await orderRepository.updateOrder(id, updateData, tx);
      }

      if (data.items) {
        await orderRepository.replaceItems(id, data.items.map((item) => ({
          productId: item.product_id,
          variantId: item.variant_id,
          quantity: item.quantity,
          unitPrice: item.unit_price,
        })), tx);
        await orderRepository.recalculateTotal(id, tx);
      }

      return this.getById(id);
    });
  },

  /* ── Fulfill Pending Online Order ──── */

  async fulfillPendingOrder({ id, customerName, tableNumber, items, amountPaid, userId }) {
    const existing = await orderRepository.findPendingById(id);
    if (!existing) throw new AppError(404, "Pending order not found", "ORDER_NOT_FOUND");
    if (existing.status !== "pending") {
      throw new AppError(400, "Only pending orders can be fulfilled", "INVALID_STATUS");
    }

    const totalAmount = items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);

    if (amountPaid < totalAmount) {
      throw new AppError(400, "Amount paid is less than total", "INSUFFICIENT_PAYMENT");
    }

    const aggregatedIngredients = await this._aggregateIngredientNeeds(items);

    await prisma.$transaction(async (tx) => {
      const updateData = {};
      if (customerName !== undefined) updateData.customerName = customerName;
      if (tableNumber !== undefined) updateData.tableNumber = tableNumber;
      if (Object.keys(updateData).length > 0) {
        await orderRepository.updateOrder(id, updateData, tx);
      }

      await orderRepository.replaceItems(id, items.map((item) => ({
        productId: item.product_id,
        variantId: item.variant_id,
        quantity: item.quantity,
        unitPrice: item.unit_price,
      })), tx);
      await orderRepository.recalculateTotal(id, tx);

      await this._deductIngredients(id, aggregatedIngredients, tx);

      await orderRepository.updateStatus(id, "accepted", {
        userId,
        amountPaid,
        change: amountPaid - totalAmount,
      }, tx);
    });

    const affectedIngredientIds = [...aggregatedIngredients.keys()];
    await productService.recomputeVariantAvailability(affectedIngredientIds);

    auditLogService.logAction({
      userId,
      action: ACTIONS.ORDER_ACCEPTED,
      targetType: "order",
      targetId: id,
      details: { total: totalAmount, source: "online" },
    }).catch(() => {});

    return this.getById(id);
  },

  /* ── Status Transitions ──────────────── */

  async advanceStatus(id, targetStatus, meta = {}) {
    const order = await orderRepository.findById(id);
    if (!order) throw new AppError(404, "Order not found", "ORDER_NOT_FOUND");

    if (!isValidTransition(order.status, targetStatus)) {
      throw new AppError(400, `Cannot move from "${order.status}" to "${targetStatus}"`, "INVALID_TRANSITION");
    }

    if (targetStatus === "accepted") {
      const result = await this._handleAcceptance(id, order, meta);
      auditLogService.logAction({
        userId: meta.userId,
        action: ACTIONS.ORDER_ACCEPTED,
        targetType: "order",
        targetId: id,
        details: { total: Number(order.totalAmount), source: order.orderSource },
      }).catch(() => {});
      return result;
    }

    const updateMeta = { userId: meta.userId };
    if (targetStatus === "completed") {
      const createdAt = new Date(order.createdAt).getTime();
      updateMeta.fulfillmentMinutes = Math.round((Date.now() - createdAt) / 60000);
    }

    await orderRepository.updateStatus(id, targetStatus, updateMeta);

    if (targetStatus === "completed") {
      auditLogService.logAction({
        userId: meta.userId,
        action: ACTIONS.ORDER_COMPLETED,
        targetType: "order",
        targetId: id,
        details: { total: Number(order.totalAmount), fulfillmentMinutes: updateMeta.fulfillmentMinutes },
      }).catch(() => {});
    }

    return this.getById(id);
  },

  /* ── Prepare Order ───────────────────── */

  async prepareOrder(id, userId) {
    const order = await orderRepository.findById(id);
    if (!order) throw new AppError(404, "Order not found", "ORDER_NOT_FOUND");

    if (!isValidTransition(order.status, "preparing")) {
      throw new AppError(400, `Cannot prepare order in "${order.status}" status`, "INVALID_TRANSITION");
    }

    await orderRepository.updateStatus(id, "preparing", { userId });

    auditLogService.logAction({
      userId,
      action: "order_preparing",
      targetType: "order",
      targetId: id,
    }).catch(() => {});

    return this.getById(id);
  },

  /* ── Check Order Item ────────────────── */

  async checkOrderItem(orderId, orderItemId, isPrepared, userId) {
    const order = await orderRepository.findById(orderId);
    if (!order) throw new AppError(404, "Order not found", "ORDER_NOT_FOUND");

    if (order.status !== "preparing" && order.status !== "accepted") {
      throw new AppError(400, "Order must be in accepted or preparing status", "INVALID_STATUS");
    }

    await orderRepository.setOrderItemPrepared(orderItemId, isPrepared, userId);

    return this.getById(orderId);
  },

  /* ── Cancel / Delete ─────────────────── */

  async cancelOrDelete(id, userId, reason, options = {}) {
    const order = await orderRepository.findById(id);
    if (!order) throw new AppError(404, "Order not found", "ORDER_NOT_FOUND");

    if (order.status === "pending") {
      await orderRepository.delete(id);
      auditLogService.logAction({
        userId,
        action: ACTIONS.ORDER_DELETED,
        targetType: "order",
        targetId: id,
        details: { total: Number(order.totalAmount) },
      }).catch(() => {});
      return { order_id: id, action: "deleted" };
    }

    if (order.status === "completed") {
      throw new AppError(400, "Cannot cancel a completed order", "INVALID_CANCELLATION");
    }

    const orderItems = await orderRepository.getOrderItems(id);
    const deductions = (order.status === "accepted" || order.status === "preparing")
      ? await orderRepository.getActiveDeductions(id)
      : [];
    const affectedIngredientIds = [...new Set(deductions.map((d) => d.ingredientId))];

    // Determine loss handling based on options
    const lossOption = options.loss_option || "no_loss"; // "no_loss" | "with_loss"
    const itemLosses = options.item_losses || []; // [{ item_id, ingredient_losses: [{ ingredient_id, quantity_lost }] }]

    await prisma.$transaction(async (tx) => {
      if (order.status === "accepted") {
        // Accepted orders: all ingredients restored (no preparation has started)
        await this._restoreIngredients(id, userId, tx);
      }

      if (order.status === "preparing") {
        const checkedItems = orderItems.filter((item) => item.isPrepared);
        const uncheckedItems = orderItems.filter((item) => !item.isPrepared);

        if (lossOption === "no_loss") {
          // No loss: restore ALL ingredients (even for checked items)
          await this._restoreIngredients(id, userId, tx);
        } else {
          // With loss: restore unchecked items, create loss records for checked items
          if (uncheckedItems.length > 0) {
            await this._restoreIngredientsForItems(id, uncheckedItems, tx);
          }

          if (checkedItems.length > 0) {
            await this._createLossRecords(id, checkedItems, userId, tx);
          }
        }
      }

      await orderRepository.updateStatus(id, "cancelled", { userId }, tx);

      await orderRepository.createCancellation({
        orderId: id,
        cancelledBy: userId,
        reason: reason || null,
      }, tx);
    });

    if (affectedIngredientIds.length > 0) {
      await productService.recomputeVariantAvailability(affectedIngredientIds);
    }

    auditLogService.logAction({
      userId,
      action: ACTIONS.ORDER_CANCELLED,
      targetType: "order",
      targetId: id,
      details: { reason: reason || null, loss_option: lossOption },
    }).catch(() => {});

    return { order_id: id, action: "cancelled" };
  },

  /* ── Override Loss ───────────────────── */

  async overrideLoss(lossId, { overrideReason, overrideNote, userId }) {
    const overrideData = {
      overrideReason,
      overrideNote: overrideNote || null,
      overriddenById: userId,
    };

    await orderRepository.overrideLoss(lossId, overrideData);

    auditLogService.logAction({
      userId,
      action: "loss_overridden",
      targetType: "loss_record",
      targetId: String(lossId),
      details: { reason: overrideReason, note: overrideNote },
    }).catch(() => {});

    return { lossId, overrideReason };
  },

  /* ── Ingredient Deduction Engine ─────── */

  async _aggregateIngredientNeeds(items) {
    const variantIds = [...new Set(items.map((item) => item.variant_id))];
    const recipes = await orderRepository.getRecipesByVariantIds(variantIds);

    const recipeMap = new Map();
    for (const recipe of recipes) {
      if (!recipeMap.has(recipe.variantId)) recipeMap.set(recipe.variantId, []);
      recipeMap.get(recipe.variantId).push(recipe);
    }

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

  async _deductIngredients(orderId, needs, tx) {
    const deductions = [];

    for (const [ingredientId, totalNeeded] of needs) {
      const batches = await orderRepository.getAvailableBatches(ingredientId, tx);
      let remaining = totalNeeded;

      for (const batch of batches) {
        if (remaining <= 0) break;

        const available = Number(batch.quantityLeft);
        const toDeduct = Math.min(remaining, available);

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

      if (remaining > 0) {
        throw new AppError(400, "Insufficient ingredient stock", "INSUFFICIENT_STOCK");
      }
    }

    if (deductions.length > 0) {
      await orderRepository.createDeductions(deductions, tx);
    }

    return deductions;
  },

  async _restoreIngredients(orderId, userId, tx) {
    const deductions = await orderRepository.getActiveDeductions(orderId, tx);

    for (const deduction of deductions) {
      await orderRepository.restoreBatch(deduction.restockBatchId, deduction.quantityDeducted, tx);
    }

    await orderRepository.reverseDeductions(orderId, userId, tx);
  },

  async _restoreIngredientsForItems(orderId, unpreparedItems, tx) {
    const allDeductions = await orderRepository.getActiveDeductions(orderId, tx);

    const variantIds = [...new Set(unpreparedItems.map((i) => i.variantId))];
    const recipes = await orderRepository.getRecipesByVariantIds(variantIds);

    const recipeMap = new Map();
    for (const r of recipes) {
      if (!recipeMap.has(r.variantId)) recipeMap.set(r.variantId, []);
      recipeMap.get(r.variantId).push(r);
    }

    const restoreNeeds = new Map();
    for (const item of unpreparedItems) {
      const itemRecipes = recipeMap.get(item.variantId) || [];
      for (const recipe of itemRecipes) {
        const needed = Number(recipe.quantityNeeded) * item.quantity;
        restoreNeeds.set(recipe.ingredientId, (restoreNeeds.get(recipe.ingredientId) || 0) + needed);
      }
    }

    for (const deduction of allDeductions) {
      const restoreQty = restoreNeeds.get(deduction.ingredientId) || 0;
      if (restoreQty > 0) {
        await orderRepository.restoreBatch(deduction.restockBatchId, restoreQty, tx);
        restoreNeeds.set(deduction.ingredientId, restoreQty - restoreQty);
      }
    }
  },

  async _createLossRecords(orderId, preparedItems, userId, tx) {
    const variantIds = [...new Set(preparedItems.map((i) => i.variantId))];
    const recipes = await orderRepository.getRecipesByVariantIds(variantIds);

    const recipeMap = new Map();
    for (const r of recipes) {
      if (!recipeMap.has(r.variantId)) recipeMap.set(r.variantId, []);
      recipeMap.get(r.variantId).push(r);
    }

    for (const item of preparedItems) {
      const itemRecipes = recipeMap.get(item.variantId) || [];
      for (const recipe of itemRecipes) {
        const quantityLost = Number(recipe.quantityNeeded) * item.quantity;
        const costPerUnit = Number(recipe.costPerUnit || 0);

        await orderRepository.createOrderItemLoss({
          ingredientId: recipe.ingredientId,
          declaredById: userId,
          lossType: "cancellation",
          quantityLost,
          costPerUnit,
          totalCostLost: quantityLost * costPerUnit,
          relatedOrderId: orderId,
          relatedOrderItemId: item.orderItemId,
          notes: `Item cancelled mid-preparation`,
        }, tx);
      }
    }
  },

  /* ── Acceptance Handler ──────────────── */

  async _handleAcceptance(id, order, meta) {
    if (!meta.amountPaid) {
      throw new AppError(400, "Amount paid is required for acceptance", "PAYMENT_REQUIRED");
    }

    if (meta.amountPaid < Number(order.totalAmount)) {
      throw new AppError(400, "Amount paid is less than total", "INSUFFICIENT_PAYMENT");
    }

    const needs = new Map();
    for (const item of order.items) {
      const recipes = await orderRepository.getRecipesByVariantId(item.variantId);
      for (const recipe of recipes) {
        const key = recipe.ingredientId;
        const needed = Number(recipe.quantityNeeded) * item.quantity;
        needs.set(key, (needs.get(key) || 0) + needed);
      }
    }

    await prisma.$transaction(async (tx) => {
      await this._deductIngredients(id, needs, tx);
      await orderRepository.updateStatus(id, "accepted", {
        userId: meta.userId,
        amountPaid: meta.amountPaid,
        change: meta.amountPaid - Number(order.totalAmount),
      }, tx);
    });

    const affectedIngredientIds = [...needs.keys()];
    await productService.recomputeVariantAvailability(affectedIngredientIds);

    return this.getById(id);
  },
};
