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

    // Fetch recipes for all items (needed for cancel dialog partial loss)
    const variantIds = [...new Set(order.items.map((i) => i.variantId))];
    const recipes = variantIds.length > 0
      ? await orderRepository.getRecipesByVariantIds(variantIds)
      : [];
    const recipeMap = new Map();
    for (const r of recipes) {
      if (!recipeMap.has(r.variantId)) recipeMap.set(r.variantId, []);
      recipeMap.get(r.variantId).push(r);
    }

    // Get actual weighted costs from deduction records
    const deductionCosts = await orderRepository.getDeductionIngredientCosts(id);
    const deductionCostMap = new Map();
    for (const dc of deductionCosts) {
      deductionCostMap.set(dc.ingredient_id, Number(dc.weighted_cost_per_unit));
    }

    // Get item removals (loss records from cancellation)
    const itemRemovals = await prisma.lossRecord.findMany({
      where: { relatedOrderId: id, lossType: "cancellation" },
      include: {
        ingredient: { select: { ingredientName: true, unit: true } },
        declaredBy: { select: { name: true, role: true } },
      },
      orderBy: { loggedAt: "asc" },
    });

    // Group removals by order_item_id
    const removalsByItem = new Map();
    for (const removal of itemRemovals) {
      const key = removal.relatedOrderItemId ?? "order";
      if (!removalsByItem.has(key)) removalsByItem.set(key, []);

      // Parse product name from notes (format: "Product Name: reason")
      const productName = removal.notes?.match(/^(.+?): /)?.[1] || null;

      removalsByItem.get(key).push({
        ingredient_name: removal.ingredient?.ingredientName ?? null,
        quantity_lost: Number(removal.quantityLost),
        cost_per_unit: Number(removal.costPerUnit),
        total_cost_lost: Number(removal.totalCostLost),
        declared_by: removal.declaredBy ? { name: removal.declaredBy.name, role: removal.declaredBy.role } : null,
        logged_at: removal.loggedAt,
        notes: removal.notes ?? null,
        product_name: productName,
      });
    }

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
      refund: order.refund
        ? {
            amount: Number(order.refund.amount),
            reason: order.refund.reason ?? null,
            refunded_at: order.refund.refundedAt ?? null,
            refunded_by: order.refund.refundedByUser
              ? { name: order.refund.refundedByUser.name, role: order.refund.refundedByUser.role }
              : null,
            item_name: order.refund.reason?.match(/^(.+?) removed/)?.[1] || null,
          }
        : null,
      item_removals: Object.fromEntries(removalsByItem),
      items: order.items.map((item) => ({
        ...formatOrderItemResponse({
          ...item,
          productName: item.product?.productName ?? null,
          sizeName: item.variant?.sizeName ?? null,
        }),
        recipes: (recipeMap.get(item.variantId) || []).map((r) => ({
          ingredient_id: r.ingredientId,
          ingredient_name: r.ingredient?.ingredientName ?? null,
          quantity_needed: Number(r.quantityNeeded),
          cost_per_unit: deductionCostMap.get(r.ingredientId) || 0,
          unit: r.ingredient?.unit ?? null,
        })),
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

    // Build weighted cost map from deductions
    const deductionCostMap = new Map();
    for (const d of deductions) {
      const cost = d.batch ? Number(d.batch.costPerUnit) : 0;
      const existing = deductionCostMap.get(d.ingredientId);
      if (existing) {
        // Weighted average across multiple batch deductions
        const totalQty = existing.qty + Number(d.quantityDeducted);
        const weightedCost = totalQty > 0
          ? ((existing.cost * existing.qty) + (cost * Number(d.quantityDeducted))) / totalQty
          : 0;
        deductionCostMap.set(d.ingredientId, { cost: weightedCost, qty: totalQty });
      } else {
        deductionCostMap.set(d.ingredientId, { cost, qty: Number(d.quantityDeducted) });
      }
    }
    const costMap = new Map();
    for (const [ingId, data] of deductionCostMap) {
      costMap.set(ingId, data.cost);
    }

    // Determine loss handling based on options
    const lossOption = options.loss_option || "no_loss"; // "no_loss" | "with_loss"
    const refundOption = options.refund_option || "partial"; // "full" | "partial" | "none"
    const itemLosses = options.item_losses || []; // [{ item_id, ingredient_losses: [{ ingredient_id, quantity_lost }] }]

    // Calculate total loss cost for refund calculation
    const orderAmountPaid = Number(order.amountPaid || 0);
    let totalLossCost = 0;
    if (lossOption === "with_loss" && itemLosses.length > 0) {
      for (const il of itemLosses) {
        for (const loss of il.ingredient_losses || []) {
          const cost = costMap.get(loss.ingredient_id) || 0;
          totalLossCost += Number(loss.quantity_lost) * cost;
        }
      }
    }

    // Calculate refund based on refund_option (or custom override)
    let refundAmount;
    if (options.refund_amount != null) {
      refundAmount = Math.min(Number(options.refund_amount), orderAmountPaid);
    } else if (refundOption === "full") {
      refundAmount = orderAmountPaid;
    } else if (refundOption === "none") {
      refundAmount = 0;
    } else {
      // partial: paid amount minus loss cost, floored at 0
      refundAmount = Math.max(orderAmountPaid - totalLossCost, 0);
    }

    await prisma.$transaction(async (tx) => {
      if (order.status === "accepted") {
        // Accepted orders: all ingredients restored (no preparation has started)
        await this._restoreIngredients(id, userId, tx);
      }

      if (order.status === "preparing") {
        if (lossOption === "no_loss") {
          // No loss: restore ALL ingredients
          await this._restoreIngredients(id, userId, tx);
        } else {
          // With loss: create loss records for items with declared losses, restore the rest
          const itemsWithLosses = orderItems.filter((item) => {
            const itemLoss = itemLosses.find((il) => il.item_id === item.orderItemId);
            return itemLoss && itemLoss.ingredient_losses.length > 0;
          });
          const itemsWithoutLosses = orderItems.filter((item) => {
            const itemLoss = itemLosses.find((il) => il.item_id === item.orderItemId);
            return !itemLoss || itemLoss.ingredient_losses.length === 0;
          });

          // Fully restore items with no declared losses
          if (itemsWithoutLosses.length > 0) {
            await this._restoreIngredientsForItems(id, itemsWithoutLosses, tx);
          }

          // For items with declared losses: create loss records + restore non-lost portions
          if (itemsWithLosses.length > 0) {
            await this._createLossRecords(id, itemsWithLosses, userId, tx, itemLosses, costMap);
            await this._restorePartialItems(id, itemsWithLosses, itemLosses, tx);
          }
        }
      }

      await orderRepository.updateStatus(id, "cancelled", { userId }, tx);

      await orderRepository.createCancellation({
        orderId: id,
        cancelledBy: userId,
        reason: reason || null,
      }, tx);

      if (refundAmount > 0 && order.amountPaid && Number(order.amountPaid) > 0) {
        await orderRepository.createRefund({
          orderId: id,
          amount: refundAmount,
          reason: reason || `Cancelled (${lossOption}, refund: ${refundOption})`,
          refundedById: userId,
        }, tx);
      }
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

  /* ── Remove Single Item ────────────── */

  async removeOrderItem(orderId, orderItemId, userId, reason, options = {}) {
    const order = await orderRepository.findById(orderId);
    if (!order) throw new AppError(404, "Order not found", "ORDER_NOT_FOUND");

    if (order.status !== "accepted" && order.status !== "preparing") {
      throw new AppError(400, "Only accepted or preparing orders can have items removed", "INVALID_STATUS");
    }

    const orderItem = await orderRepository.getOrderItemById(orderItemId);
    if (!orderItem || orderItem.orderId !== orderId) {
      throw new AppError(404, "Order item not found", "ORDER_ITEM_NOT_FOUND");
    }

    const lossOption = options.loss_option || "no_loss";
    const refundOption = options.refund_option || "partial";
    const ingredientLosses = options.ingredient_losses || [];
    const isPrepared = orderItem.isPrepared;

    // Fetch recipes for this item's variant
    const recipes = await orderRepository.getRecipesByVariantIds([orderItem.variantId]);
    const itemRecipes = recipes.filter((r) => r.variantId === orderItem.variantId);

    // Calculate refund based on refund_option
    const itemSubtotal = Number(orderItem.subtotal || 0);

    // Get active deductions for restore/loss calculations
    const deductions = await orderRepository.getActiveDeductions(orderId);
    const affectedIngredientIds = [...new Set(deductions.map((d) => d.ingredientId))];

    // Build weighted cost map from deductions
    const deductionCostMap = new Map();
    for (const d of deductions) {
      const cost = d.batch ? Number(d.batch.costPerUnit) : 0;
      const existing = deductionCostMap.get(d.ingredientId);
      if (existing) {
        const totalQty = existing.qty + Number(d.quantityDeducted);
        const weightedCost = totalQty > 0
          ? ((existing.cost * existing.qty) + (cost * Number(d.quantityDeducted))) / totalQty
          : 0;
        deductionCostMap.set(d.ingredientId, { cost: weightedCost, qty: totalQty });
      } else {
        deductionCostMap.set(d.ingredientId, { cost, qty: Number(d.quantityDeducted) });
      }
    }
    const itemCostMap = new Map();
    for (const [ingId, data] of deductionCostMap) {
      itemCostMap.set(ingId, data.cost);
    }

    // Calculate total loss cost from user-specified ingredient losses
    let totalLossCost = 0;
    if (lossOption === "with_loss" && ingredientLosses.length > 0) {
      for (const loss of ingredientLosses) {
        const cost = itemCostMap.get(loss.ingredient_id) || 0;
        totalLossCost += Number(loss.quantity_lost) * cost;
      }
    }

    // Calculate refund based on refund_option (or custom override)
    let refundAmount;
    if (options.refund_amount != null) {
      refundAmount = Math.min(Number(options.refund_amount), itemSubtotal);
    } else if (refundOption === "full") {
      refundAmount = itemSubtotal;
    } else if (refundOption === "none") {
      refundAmount = 0;
    } else {
      // partial: subtotal minus loss cost, floored at 0
      refundAmount = Math.max(itemSubtotal - totalLossCost, 0);
    }

    await prisma.$transaction(async (tx) => {
      if (!isPrepared) {
        // Unchecked item: restore this item's ingredients proportionally
        await this._restoreIngredientsForSingleItem(orderItem, itemRecipes, deductions, tx);
      } else {
        // Checked (served) item: loss handling
        if (lossOption === "no_loss") {
          // Restore anyway (item was served but we still restore)
          await this._restoreIngredientsForSingleItem(orderItem, itemRecipes, deductions, tx);
        } else {
          // With loss: create loss records, restore non-lost portions
          await this._createLossRecordsForSingleItem(orderId, orderItem, itemRecipes, userId, tx, ingredientLosses, itemCostMap);
          await this._restorePartialForSingleItem(orderItem, itemRecipes, ingredientLosses, deductions, tx);
        }
      }

      // Delete the order item
      await orderRepository.deleteOrderItem(orderItemId, tx);

      // Recalculate order total
      const newTotal = Number(order.totalAmount) - refundAmount;
      await orderRepository.updateOrder(orderId, { totalAmount: Math.max(newTotal, 0) }, tx);

      // Count remaining items
      const remainingCount = await orderRepository.countOrderItems(orderId, tx);

      // If no items left, cancel the entire order
      if (remainingCount === 0) {
        await orderRepository.updateStatus(orderId, "cancelled", { userId }, tx);
        await orderRepository.createCancellation({
          orderId,
          cancelledBy: userId,
          reason: reason || "All items removed",
        }, tx);
      }

      // Create refund if amount was paid
      if (refundAmount > 0 && order.amountPaid && Number(order.amountPaid) > 0) {
        const itemLabel = orderItem.product?.productName
          ? (orderItem.variant?.sizeName ? `${orderItem.product.productName} (${orderItem.variant.sizeName})` : orderItem.product.productName)
          : null;
        await orderRepository.createRefund({
          orderId,
          amount: refundAmount,
          reason: reason || (itemLabel ? `${itemLabel} removed (${lossOption})` : `Item removed (${lossOption})`),
          refundedById: userId,
        }, tx);
      }
    });

    if (affectedIngredientIds.length > 0) {
      await productService.recomputeVariantAvailability(affectedIngredientIds);
    }

    auditLogService.logAction({
      userId,
      action: "order_item_removed",
      targetType: "order_item",
      targetId: String(orderItemId),
      details: {
        order_id: orderId,
        product_name: orderItem.product?.productName,
        reason,
        loss_option: lossOption,
        refund_amount: refundAmount,
      },
    }).catch(() => {});

    const remainingCount = await orderRepository.countOrderItems(orderId);
    return {
      order_id: orderId,
      action: remainingCount === 0 ? "cancelled" : "item_removed",
      refund_amount: refundAmount,
    };
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
          costPerUnit: Number(batch.costPerUnit),
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

    const restoreTracker = new Map(restoreNeeds);
    for (const deduction of allDeductions) {
      const remaining = restoreTracker.get(deduction.ingredientId) || 0;
      if (remaining <= 0) continue;

      const restoreQty = Math.min(remaining, Number(deduction.quantityDeducted));
      if (restoreQty > 0) {
        await orderRepository.restoreBatch(deduction.restockBatchId, restoreQty, tx);
        restoreTracker.set(deduction.ingredientId, remaining - restoreQty);
      }
    }
  },

  async _restorePartialItems(orderId, preparedItems, itemLosses, tx) {
    const allDeductions = await orderRepository.getActiveDeductions(orderId, tx);

    const variantIds = [...new Set(preparedItems.map((i) => i.variantId))];
    const recipes = await orderRepository.getRecipesByVariantIds(variantIds);

    const recipeMap = new Map();
    for (const r of recipes) {
      if (!recipeMap.has(r.variantId)) recipeMap.set(r.variantId, []);
      recipeMap.get(r.variantId).push(r);
    }

    // Build loss lookup: { order_item_id -> Set<ingredient_id> }
    const lossSetMap = new Map();
    for (const entry of itemLosses) {
      const lostIds = new Set((entry.ingredient_losses || []).map((il) => il.ingredient_id));
      lossSetMap.set(entry.order_item_id, lostIds);
    }

    // For each prepared item, calculate total recipe needs per ingredient,
    // then restore the difference (total - lost amount)
    const restoreNeeds = new Map();
    for (const item of preparedItems) {
      const lostIds = lossSetMap.get(item.orderItemId);
      if (!lostIds) continue; // No partial loss specified for this item — auto mode, no restore

      const itemRecipes = recipeMap.get(item.variantId) || [];
      for (const recipe of itemRecipes) {
        const totalNeeded = Number(recipe.quantityNeeded) * item.quantity;
        if (lostIds.has(recipe.ingredientId)) {
          // This ingredient is declared as loss — restore = total - lost_amount (which is total in auto, or user-specified)
          // The loss amount is handled by _createLossRecords; restore only the non-lost portion
          const lossEntry = (itemLosses.find((e) => e.order_item_id === item.orderItemId))
            ?.ingredient_losses?.find((il) => il.ingredient_id === recipe.ingredientId);
          const lostQty = lossEntry ? Number(lossEntry.quantity_lost) : totalNeeded;
          const restoreQty = totalNeeded - lostQty;
          if (restoreQty > 0) {
            restoreNeeds.set(recipe.ingredientId, (restoreNeeds.get(recipe.ingredientId) || 0) + restoreQty);
          }
        } else {
          // Not declared as loss — restore all
          restoreNeeds.set(recipe.ingredientId, (restoreNeeds.get(recipe.ingredientId) || 0) + totalNeeded);
        }
      }
    }

    for (const deduction of allDeductions) {
      const restoreQty = restoreNeeds.get(deduction.ingredientId) || 0;
      if (restoreQty > 0) {
        await orderRepository.restoreBatch(deduction.restockBatchId, restoreQty, tx);
        restoreNeeds.set(deduction.ingredientId, 0);
      }
    }
  },

  /* ── Single-Item Restore/Loss Helpers ── */

  /**
   * Restore ingredients for a single item proportionally from deductions.
   */
  async _restoreIngredientsForSingleItem(orderItem, itemRecipes, allDeductions, tx) {
    // Calculate what this item needs per ingredient
    const needs = new Map();
    for (const recipe of itemRecipes) {
      const needed = Number(recipe.quantityNeeded) * orderItem.quantity;
      needs.set(recipe.ingredientId, (needs.get(recipe.ingredientId) || 0) + needed);
    }

    // Restore from deductions (FIFO order)
    const restoreTracker = new Map(); // ingredientId -> remaining to restore
    for (const [ingId, qty] of needs) {
      restoreTracker.set(ingId, qty);
    }

    for (const deduction of allDeductions) {
      const remaining = restoreTracker.get(deduction.ingredientId) || 0;
      if (remaining <= 0) continue;

      const restoreQty = Math.min(remaining, Number(deduction.quantityDeducted));
      if (restoreQty > 0) {
        await orderRepository.restoreBatch(deduction.restockBatchId, restoreQty, tx);
        restoreTracker.set(deduction.ingredientId, remaining - restoreQty);
      }
    }
  },

  /**
   * Create loss records for a single checked item.
   */
  async _createLossRecordsForSingleItem(orderId, orderItem, itemRecipes, userId, tx, ingredientLosses = [], deductionCostMap = new Map()) {
    // Build lookup for user-specified losses: { ingredient_id -> quantity_lost }
    const lossMap = new Map();
    for (const entry of ingredientLosses) {
      lossMap.set(entry.ingredient_id, entry.quantity_lost);
    }

    const itemLabel = orderItem.product?.productName
      ? (orderItem.variant?.sizeName ? `${orderItem.product.productName} (${orderItem.variant.sizeName})` : orderItem.product.productName)
      : null;

    for (const recipe of itemRecipes) {
      const totalNeeded = Number(recipe.quantityNeeded) * orderItem.quantity;
      const quantityLost = lossMap.has(recipe.ingredientId)
        ? Number(lossMap.get(recipe.ingredientId))
        : totalNeeded;

      if (quantityLost <= 0) continue;

      const costPerUnit = deductionCostMap.get(recipe.ingredientId) || 0;

      await orderRepository.createOrderItemLoss({
        ingredientId: recipe.ingredientId,
        declaredById: userId,
        lossType: "cancellation",
        quantityLost,
        costPerUnit,
        totalCostLost: quantityLost * costPerUnit,
        relatedOrderId: orderId,
        relatedOrderItemId: orderItem.orderItemId,
        notes: lossMap.has(recipe.ingredientId)
          ? `${itemLabel}: Partial loss declared`
          : `${itemLabel}: Item cancelled mid-preparation`,
      }, tx);
    }
  },

  /**
   * Restore non-lost portion of a single checked item's ingredients.
   */
  async _restorePartialForSingleItem(orderItem, itemRecipes, ingredientLosses, allDeductions, tx) {
    const lossMap = new Map();
    for (const entry of ingredientLosses) {
      lossMap.set(entry.ingredient_id, entry.quantity_lost);
    }

    const restoreNeeds = new Map();
    for (const recipe of itemRecipes) {
      const totalNeeded = Number(recipe.quantityNeeded) * orderItem.quantity;
      if (lossMap.has(recipe.ingredientId)) {
        const lostQty = Number(lossMap.get(recipe.ingredientId));
        const restoreQty = totalNeeded - lostQty;
        if (restoreQty > 0) {
          restoreNeeds.set(recipe.ingredientId, (restoreNeeds.get(recipe.ingredientId) || 0) + restoreQty);
        }
      } else {
        // Not declared as loss — restore all
        restoreNeeds.set(recipe.ingredientId, (restoreNeeds.get(recipe.ingredientId) || 0) + totalNeeded);
      }
    }

    const restoreTracker = new Map(restoreNeeds);
    for (const deduction of allDeductions) {
      const remaining = restoreTracker.get(deduction.ingredientId) || 0;
      if (remaining <= 0) continue;

      const restoreQty = Math.min(remaining, Number(deduction.quantityDeducted));
      if (restoreQty > 0) {
        await orderRepository.restoreBatch(deduction.restockBatchId, restoreQty, tx);
        restoreTracker.set(deduction.ingredientId, remaining - restoreQty);
      }
    }
  },

  async _createLossRecords(orderId, preparedItems, userId, tx, itemLosses = [], deductionCostMap = new Map()) {
    const variantIds = [...new Set(preparedItems.map((i) => i.variantId))];
    const recipes = await orderRepository.getRecipesByVariantIds(variantIds);

    const recipeMap = new Map();
    for (const r of recipes) {
      if (!recipeMap.has(r.variantId)) recipeMap.set(r.variantId, []);
      recipeMap.get(r.variantId).push(r);
    }

    // Build lookup for user-specified partial losses: { order_item_id -> { ingredient_id -> quantity_lost } }
    const partialLossMap = new Map();
    for (const entry of itemLosses) {
      const ingredientMap = new Map();
      for (const il of entry.ingredient_losses || []) {
        ingredientMap.set(il.ingredient_id, il.quantity_lost);
      }
      partialLossMap.set(entry.order_item_id, ingredientMap);
    }

    for (const item of preparedItems) {
      const itemRecipes = recipeMap.get(item.variantId) || [];
      const partialMap = partialLossMap.get(item.orderItemId);

      for (const recipe of itemRecipes) {
        // If partial loss specified for this item, use user-declared quantity; otherwise auto-calculate
        const quantityLost = partialMap?.has(recipe.ingredientId)
          ? Number(partialMap.get(recipe.ingredientId))
          : Number(recipe.quantityNeeded) * item.quantity;

        if (quantityLost <= 0) continue;

        const costPerUnit = deductionCostMap.get(recipe.ingredientId) || 0;

        const itemLabel = item.product?.productName
          ? (item.variant?.sizeName ? `${item.product.productName} (${item.variant.sizeName})` : item.product.productName)
          : null;

        await orderRepository.createOrderItemLoss({
          ingredientId: recipe.ingredientId,
          declaredById: userId,
          lossType: "cancellation",
          quantityLost,
          costPerUnit,
          totalCostLost: quantityLost * costPerUnit,
          relatedOrderId: orderId,
          relatedOrderItemId: item.orderItemId,
          notes: partialMap?.has(recipe.ingredientId)
            ? `${itemLabel}: Partial loss declared`
            : `${itemLabel}: Item cancelled mid-preparation`,
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
