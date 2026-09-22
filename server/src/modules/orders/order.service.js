import { orderRepository } from "./order.repository.js";
import { isValidTransition, formatOrderResponse, formatOrderItemResponse, computeDiscountedTotal, roundMoney, composeOrderNumber, formatOrderNumber } from "./order.utils.js";
import { shiftService } from "../shifts/shift.service.js";
import { AppError } from "../../middleware/errorHandler.middleware.js";
import { productService } from "../products/product.service.js";
import prisma from "../../config/prisma.js";
import { auditLogService } from "../auditLogs/auditLog.service.js";
import { ACTIONS } from "../auditLogs/auditLog.constants.js";
import { notificationService } from "../notifications/notification.service.js";
import { settingsService } from "../settings/settings.service.js";
import { anomalyService } from "../anomalyDetection/anomalyDetection.service.js";

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
    // Independent of the recipe lookup above — one round instead of two.
    const [deductionCosts, lossRecords] = await Promise.all([
      orderRepository.getDeductionIngredientCosts(id),
      orderRepository.getOrderItemLosses(id),
    ]);
    const deductionCostMap = new Map();
    for (const dc of deductionCosts) {
      deductionCostMap.set(dc.ingredient_id, Number(dc.weighted_cost_per_unit));
    }

    // Query loss records and group by order item
    const lossCostMap = new Map();
    for (const record of lossRecords) {
      const itemId = record.relatedOrderItemId;
      if (itemId == null) continue;
      lossCostMap.set(itemId, (lossCostMap.get(itemId) || 0) + Number(record.totalCostLost));
    }

    return {
      ...formatOrderResponse(order),
      creator_name: order.creator?.name ?? null,
      creator_role: order.creator?.role ?? null,
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
            cancel_reason: order.refund.reason?.match(/— (.+?) \(/)?.[1] || null,
          }
        : null,
      items: order.items.map((item) => ({
        ...formatOrderItemResponse({
          ...item,
          productName: item.product?.productName ?? null,
          sizeName: item.variant?.sizeName ?? null,
        }),
        is_removed: !!item.removedAt,
        removed_at: item.removedAt ?? null,
        removed_by: item.removedByUser ? { name: item.removedByUser.name, role: item.removedByUser.role } : null,
        removed_reason: item.removedReason ?? null,
        removed_loss_option: item.removedLossOption ?? null,
        ingredient_loss_cost: lossCostMap.get(item.orderItemId) || 0,
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

  async createWalkIn({ customerName, tableNumber, items, amountPaid, createdBy, orderDate: orderDateStr, discount = {}, payment = {} }) {
    // BR-02: payment requires an open drawer session.
    // Independent reads — one round instead of three sequential ones.
    const [{ shiftId }, { pricedItems, subtotal, discount: discountResult, total }] = await Promise.all([
      shiftService.resolveShiftForUser(createdBy),
      this._priceItemsAndTotals(items, discount),
    ]);

    await this._assertPaymentValid({ amountPaid, total, paymentMethod: payment.payment_method });

    const paymentMethod = payment.payment_method ?? "cash";
    const change = paymentMethod === "cash" ? roundMoney(amountPaid - total) : 0;

    const aggregatedIngredients = await this._aggregateIngredientNeeds(pricedItems);

    const order = await prisma.$transaction(async (tx) => {
      const now = new Date();
      const orderDate = orderDateStr
        ? new Date(orderDateStr + "T00:00:00Z")
        : new Date(now.toISOString().split("T")[0]);
      const orderNumber = composeOrderNumber(orderDate, await orderRepository.getNextOrderNumber(orderDate, tx));

      const newOrder = await orderRepository.createOrder({
        orderNumber,
        orderDate,
        customerName,
        tableNumber,
        orderSource: "walk_in",
        status: "accepted",
        subtotalAmount: subtotal,
        discountType: discountResult.discountType,
        discountPercent: discountResult.discountPercent,
        discountLabel: discount.discount_label ?? null,
        discountIdNo: discount.discount_id_no ?? null,
        discountAmount: discountResult.discountAmount,
        discountBy: discountResult.discountType === "none" ? null : createdBy,
        paymentMethod,
        referenceNo: payment.reference_no ?? null,
        shiftId,
        totalAmount: total,
        amountPaid: paymentMethod === "cash" ? amountPaid : total,
        change,
        createdBy,
        acceptedAt: now,
        acceptedBy: createdBy,
      }, pricedItems.map((item) => ({
        productId: item.product_id,
        variantId: item.variant_id,
        quantity: item.quantity,
        unitPrice: item.unit_price,
      })), tx);

      const { deductions, needs } = await this._deductIngredients(newOrder.orderId, aggregatedIngredients, tx, createdBy);
      // BR-03: issuance record for the receipt/ledger (reprint-safe).
      await orderRepository.upsertReceipt({
        orderId: newOrder.orderId,
        issuedBy: createdBy,
        totalAmount: total,
      }, tx);
      return { order: newOrder, deductions, needs };
    }, { timeout: 15000 });

    const affectedIngredientIds = [...aggregatedIngredients.keys()];
    productService.recomputeVariantAvailability(affectedIngredientIds).catch((err) => console.warn("[menu] availability recompute dropped:", err?.message));
    this._checkStockLevels(order.needs).catch(() => {});

    auditLogService.logAction({
      userId: createdBy,
      action: ACTIONS.ORDER_CREATED,
      targetType: "order",
      targetId: order.order.orderId,
      details: { order_number: order.order.orderNumber, subtotal, discount: discountResult.discountAmount, total, source: "walk_in", paymentMethod },
    }).catch(() => {});

    notificationService.create({
      type: "order_new",
      title: "New Walk-In Order",
      message: `Order ${formatOrderNumber(order.order.orderNumber)} from ${customerName} — ₱${total.toFixed(2)}`,
      referenceType: "order",
      referenceId: order.order.orderId,
    }).catch(() => {});

    // Light response: POS only needs the id for receipt printing (the full
    // detail reloads via GET /:id and list invalidation). Skips the 4-query
    // getById tail on the hot path.
    return { order_id: order.order.orderId, order_number: order.order.orderNumber };
  },

  /* ── Online Order Creation (Guest) ──── */

  async createOnline({ customerName, tableNumber, items, guestToken, orderDate: orderDateStr }) {
    // Server re-price so guests can't tamper with totals (no discount at placement).
    const { pricedItems, total } = await this._priceItemsAndTotals(items, { discount_type: "none" });

    const result = await prisma.$transaction(async (tx) => {
      const now = new Date();
      const orderDate = orderDateStr
        ? new Date(orderDateStr + "T00:00:00Z")
        : new Date(now.toISOString().split("T")[0]);
      const orderNumber = composeOrderNumber(orderDate, await orderRepository.getNextOrderNumber(orderDate, tx));

      return orderRepository.createOnlineOrder({
        orderNumber,
        orderDate,
        customerName,
        tableNumber,
        totalAmount: total,
        guestToken,
      }, pricedItems.map((item) => ({
        productId: item.product_id,
        variantId: item.variant_id,
        quantity: item.quantity,
        unitPrice: item.unit_price,
      })), tx);
    }, { timeout: 15000 });

    // Light response: POS only needs the id for receipt printing (the full
    // detail reloads via GET /:id and list invalidation). Skips the 4-query
    // getById tail on the hot path.
    const created = {
      order_id: result.orderId,
      order_number: orderNumber,
      guest_token: guestToken,
      total_amount: total,
      created_at: new Date().toISOString(),
    };

    notificationService.create({
      type: "order_new",
      title: "New Online Order",
      message: `Order ${formatOrderNumber(created.order_number)} from ${customerName} — ₱${total.toFixed(2)}`,
      referenceType: "order",
      referenceId: result.orderId,
    }).catch(() => {});

    auditLogService.logAction({
      action: ACTIONS.ORDER_CREATED,
      targetType: "order",
      targetId: result.orderId,
      details: { order_number: created.order_number, total, source: "online" },
    }).catch(() => {});

    return created;
  },

  /* ── Receipt Payload (BR-03) ─────────── */

  /**
   * Everything a printed receipt needs: the order with items and
   * payment, its issuance record, and the store header.
   */
  async getReceiptPayload(id) {
    const order = await this.getById(id);
    if (order.status === "pending") {
      throw new AppError(400, "Unpaid orders have no receipt", "RECEIPT_UNPAID");
    }
    const [receipt, store] = await Promise.all([
      orderRepository.findReceiptByOrder(id),
      prisma.systemSettings.findUnique({ where: { id: 1 } }),
    ]);
    return {
      receipt: receipt
        ? {
            receipt_id: receipt.receiptId,
            issued_at: receipt.issuedAt,
            issued_by: receipt.issuedBy,
          }
        : null,
      order,
      store: store
        ? {
            name: store.storeName,
            address: store.storeAddress,
            phone: store.storePhone,
            email: store.storeEmail,
          }
        : null,
    };
  },

  /* ── Edit Pending Order ──────────────── */

  async editPending(id, data, userId) {
    const existing = await orderRepository.findPendingById(id);
    if (!existing) throw new AppError(404, "Pending order not found", "ORDER_NOT_FOUND");
    if (existing.status !== "pending") {
      throw new AppError(400, "Only pending orders can be edited", "INVALID_STATUS");
    }
    const editedFields = [
      ...(data.customer_name !== undefined ? ["customer_name"] : []),
      ...(data.table_number !== undefined ? ["table_number"] : []),
      ...(data.items !== undefined ? ["items"] : []),
    ];

    await prisma.$transaction(async (tx) => {
      // Claim first: a concurrent fulfill loses here instead of racing the edit.
      const claimed = await orderRepository.claimStatus(id, "pending", "pending", tx);
      if (claimed === 0) {
        throw new AppError(409, "Order is no longer pending — it was settled concurrently", "ORDER_ALREADY_SETTLED");
      }

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
    }, { timeout: 15000 });
    // Read AFTER commit via the global client so the response reflects the edit.
    const result = await this.getById(id);
    auditLogService.logAction({
      userId,
      action: ACTIONS.ORDER_UPDATED,
      targetType: "order",
      targetId: id,
      details: { order_number: existing.orderNumber, fields: editedFields },
    }).catch(() => {});
    return result;
  },

  /* ── Fulfill Pending Online Order ──── */

  async fulfillPendingOrder({ id, customerName, tableNumber, items, amountPaid, userId, discount = {}, payment = {} }) {
    const existing = await orderRepository.findPendingById(id);
    if (!existing) throw new AppError(404, "Pending order not found", "ORDER_NOT_FOUND");
    if (existing.status !== "pending") {
      throw new AppError(400, "Only pending orders can be fulfilled", "INVALID_STATUS");
    }

    // BR-02: payment requires an open drawer session.
    // Independent reads — shift lookup and pricing run together.
    const [{ shiftId }, { pricedItems, subtotal, discount: discountResult, total }] = await Promise.all([
      shiftService.resolveShiftForUser(userId),
      this._priceItemsAndTotals(items, discount),
    ]);

    await this._assertPaymentValid({ amountPaid, total, paymentMethod: payment.payment_method });

    const paymentMethod = payment.payment_method ?? "cash";
    const change = paymentMethod === "cash" ? roundMoney(amountPaid - total) : 0;
    const paidToStore = paymentMethod === "cash" ? amountPaid : total;

    const aggregatedIngredients = await this._aggregateIngredientNeeds(pricedItems);

    let transactionNeeds;

    await prisma.$transaction(async (tx) => {
      // Claim first: a concurrent fulfill loses here instead of double-deducting.
      const claimed = await orderRepository.claimStatus(id, "pending", "accepted", tx);
      if (claimed === 0) {
        throw new AppError(409, "Order is no longer pending — it was fulfilled concurrently", "ORDER_ALREADY_SETTLED");
      }

      const updateData = {};
      if (customerName !== undefined) updateData.customerName = customerName;
      if (tableNumber !== undefined) updateData.tableNumber = tableNumber;
      if (Object.keys(updateData).length > 0) {
        await orderRepository.updateOrder(id, updateData, tx);
      }

      await orderRepository.replaceItems(id, pricedItems.map((item) => ({
        productId: item.product_id,
        variantId: item.variant_id,
        quantity: item.quantity,
        unitPrice: item.unit_price,
      })), tx);

      const { needs } = await this._deductIngredients(id, aggregatedIngredients, tx, userId);
      transactionNeeds = needs;

      await orderRepository.upsertReceipt({
        orderId: id,
        issuedBy: userId,
        totalAmount: total,
      }, tx);

      await orderRepository.updateStatus(id, "accepted", {
        userId,
        subtotalAmount: subtotal,
        discountType: discountResult.discountType,
        discountPercent: discountResult.discountPercent,
        discountLabel: discount.discount_label ?? null,
        discountIdNo: discount.discount_id_no ?? null,
        discountAmount: discountResult.discountAmount,
        discountBy: discountResult.discountType === "none" ? null : userId,
        paymentMethod,
        referenceNo: payment.reference_no ?? null,
        shiftId,
        totalAmount: total,
        amountPaid: paidToStore,
        change,
      }, tx);
    }, { timeout: 15000 });

    const affectedIngredientIds = [...aggregatedIngredients.keys()];
    productService.recomputeVariantAvailability(affectedIngredientIds).catch((err) => console.warn("[menu] availability recompute dropped:", err?.message));
    this._checkStockLevels(transactionNeeds).catch(() => {});

    auditLogService.logAction({
      userId,
      action: ACTIONS.ORDER_ACCEPTED,
      targetType: "order",
      targetId: id,
      details: { order_number: existing.orderNumber, subtotal, discount: discountResult.discountAmount, total, source: "online", paymentMethod },
    }).catch(() => {});

    // Light response (same rationale as createWalkIn above).
    return { order_id: id, order_number: existing.orderNumber };
  },

  /* ── Status Transitions ──────────────── */

  async advanceStatus(id, targetStatus, meta = {}) {
    const order = await orderRepository.findById(id);
    if (!order) throw new AppError(404, "Order not found", "ORDER_NOT_FOUND");

    if (!isValidTransition(order.status, targetStatus)) {
      throw new AppError(400, `Cannot move from "${order.status}" to "${targetStatus}"`, "INVALID_TRANSITION");
    }

    if (targetStatus === "completed") {
      const createdAt = new Date(order.createdAt).getTime();
      const fulfillmentMinutes = Math.round((Date.now() - createdAt) / 60000);

      // Check + flip inside one tx: items can't slip to unprepared between
      // the check and the update, and a concurrent settle loses the claim.
      await prisma.$transaction(async (tx) => {
        const items = await orderRepository.getOrderItems(id, tx);
        if (items.length === 0 || !items.every((i) => i.isPrepared)) {
          throw new AppError(400, "All items must be marked as prepared before completing", "NOT_ALL_PREPARED");
        }
        const claimed = await orderRepository.claimStatus(id, ["accepted", "preparing"], "completed", tx);
        if (claimed === 0) {
          throw new AppError(409, "Order is no longer completable — it was settled concurrently", "ORDER_ALREADY_SETTLED");
        }
        await orderRepository.updateStatus(id, "completed", { userId: meta.userId, fulfillmentMinutes }, tx);
      }, { timeout: 15000 });

      auditLogService.logAction({
        userId: meta.userId,
        action: ACTIONS.ORDER_COMPLETED,
        targetType: "order",
        targetId: id,
        details: { order_number: order.orderNumber, total: Number(order.totalAmount), fulfillmentMinutes },
      }).catch(() => {});

      notificationService.create({
        type: "order_completed",
        title: "Order Completed",
        message: `Order ${formatOrderNumber(order.orderNumber)} completed in ${fulfillmentMinutes} min — ₱${Number(order.totalAmount).toFixed(2)}`,
        referenceType: "order",
        referenceId: id,
      }).catch(() => {});

      // Real-time anomaly hook: discount spike (fire-and-forget)
      anomalyService.runScan(["discount_spike"]).catch((err) => console.warn("[anomaly] hook scan dropped:", err?.message));

      return this.getById(id);
    }

    if (targetStatus === "accepted") {
      const result = await this._handleAcceptance(id, order, meta);
      auditLogService.logAction({
        userId: meta.userId,
        action: ACTIONS.ORDER_ACCEPTED,
        targetType: "order",
        targetId: id,
        details: { order_number: order.orderNumber, total: Number(order.totalAmount), source: order.orderSource },
      }).catch(() => {});

      notificationService.create({
        type: "order_accepted",
        title: "Order Accepted",
        message: `Order ${formatOrderNumber(order.orderNumber)} has been accepted`,
        referenceType: "order",
        referenceId: id,
      }).catch(() => {});

      return result;
    }

    const updateMeta = { userId: meta.userId };
    await orderRepository.updateStatus(id, targetStatus, updateMeta);

    return this.getById(id);
  },

  /* ── Prepare Order ───────────────────── */

  async prepareOrder(id, userId) {
    const order = await orderRepository.findByIdGuard(id);
    if (!order) throw new AppError(404, "Order not found", "ORDER_NOT_FOUND");

    if (!isValidTransition(order.status, "preparing")) {
      throw new AppError(400, `Cannot prepare order in "${order.status}" status`, "INVALID_TRANSITION");
    }

    await orderRepository.updateStatus(id, "preparing", { userId });

    auditLogService.logAction({
      userId,
      action: ACTIONS.ORDER_PREPARING,
      targetType: "order",
      targetId: id,
      details: { order_number: order.orderNumber },
    }).catch(() => {});

    return this.getById(id);
  },

  /* ── Check Order Item ────────────────── */

  async checkOrderItem(orderId, orderItemId, isPrepared, userId) {
    const order = await orderRepository.findByIdGuard(orderId);
    if (!order) throw new AppError(404, "Order not found", "ORDER_NOT_FOUND");

    if (order.status !== "preparing" && order.status !== "accepted") {
      throw new AppError(400, "Order must be in accepted or preparing status", "INVALID_STATUS");
    }

    await orderRepository.setOrderItemPrepared(orderItemId, isPrepared, userId);

    return this.getById(orderId);
  },

  /* ── Cancel / Delete ─────────────────── */

  async cancelOrDelete(id, userId, reason, options = {}) {
    const order = await orderRepository.findByIdGuard(id);
    if (!order) throw new AppError(404, "Order not found", "ORDER_NOT_FOUND");

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
    let lossOption = options.loss_option || "no_loss"; // "no_loss" | "with_loss"
    const refundOption = options.refund_option || "partial"; // "full" | "partial" | "none"
    const itemLosses = options.item_losses || []; // [{ item_id, ingredient_losses: [{ ingredient_id, quantity_lost }] }]

    // Refund capped at what the customer actually paid (minus prior refunds) —
    // cumulative refunds can never exceed tender, even across removals + cancel.
    const paidForCap = order.amountPaid != null ? Number(order.amountPaid) : Number(order.totalAmount) || 0;
    const paidCap = Math.max(0, roundMoney(paidForCap - Number(order.refund?.amount || 0)));
    let refundAmount;
    if (refundOption === "full") {
      refundAmount = Math.min(Number(order.totalAmount), paidCap);
    } else if (refundOption === "none") {
      refundAmount = 0;
    } else if (options.refund_amount != null) {
      // partial: user-specified amount, capped at drop-equivalent and paid
      refundAmount = Math.min(Number(options.refund_amount), Number(order.totalAmount), paidCap);
    } else {
      refundAmount = 0;
    }
    refundAmount = Math.max(0, roundMoney(refundAmount));

    await prisma.$transaction(async (tx) => {
      // Claim first: a concurrent settle loses here instead of double-restoring.
      const claimed = await orderRepository.claimStatus(id, ["pending", "accepted", "preparing"], "cancelled", tx);
      if (claimed === 0) {
        throw new AppError(409, "Order is no longer cancellable — it was settled concurrently", "ORDER_ALREADY_SETTLED");
      }
      // Re-read inside the tx: the pre-tx `order.status` may have advanced
      // (e.g. pending → accepted with fresh deductions) before our claim.
      const fresh = await tx.order.findUnique({ where: { orderId: id }, select: { status: true } });
      const currentStatus = fresh.status;

      // Accepted orders: no preparation has started, force no loss
      if (currentStatus === "accepted") {
        lossOption = "no_loss";
      }

      if (currentStatus === "accepted") {
        // Accepted orders: all ingredients restored (no preparation has started)
        await this._restoreIngredients(id, userId, tx);
      }

      if (currentStatus === "preparing") {
        if (lossOption === "no_loss") {
          // No loss: restore ALL ingredients
          await this._restoreIngredients(id, userId, tx);
        } else {
          // With loss: create loss records for items with declared losses, restore the rest
          const itemsWithLosses = orderItems.filter((item) => {
            const itemLoss = itemLosses.find((il) => il.order_item_id === item.orderItemId);
            return itemLoss && itemLoss.ingredient_losses.length > 0;
          });
          const itemsWithoutLosses = orderItems.filter((item) => {
            const itemLoss = itemLosses.find((il) => il.order_item_id === item.orderItemId);
            return !itemLoss || itemLoss.ingredient_losses.length === 0;
          });

          // Fully restore items with no declared losses
          if (itemsWithoutLosses.length > 0) {
            await this._restoreIngredientsForItems(id, itemsWithoutLosses, tx, userId);
          }

          // For items with declared losses: create loss records + restore non-lost portions
          if (itemsWithLosses.length > 0) {
            await this._createLossRecords(id, itemsWithLosses, userId, tx, itemLosses, costMap);
            await this._restorePartialItems(id, itemsWithLosses, itemLosses, tx, userId);
          }
        }
      }

      // Tag each item with its loss option for frontend display (batched)
      const withLossIds = orderItems
        .filter((item) => {
          const itemLoss = itemLosses.find((il) => il.order_item_id === item.orderItemId);
          return lossOption === "with_loss" && itemLoss && itemLoss.ingredient_losses?.length > 0;
        })
        .map((item) => item.orderItemId);
      await tx.orderItem.updateMany({
        where: { orderId: id },
        data: { removedLossOption: "no_loss" },
      });
      if (withLossIds.length > 0) {
        await tx.orderItem.updateMany({
          where: { orderItemId: { in: withLossIds } },
          data: { removedLossOption: "with_loss" },
        });
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
    }, { timeout: 15000 });

    if (affectedIngredientIds.length > 0) {
      productService.recomputeVariantAvailability(affectedIngredientIds).catch((err) => console.warn("[menu] availability recompute dropped:", err?.message));
    }

    auditLogService.logAction({
      userId,
      action: ACTIONS.ORDER_CANCELLED,
      targetType: "order",
      targetId: id,
      details: { order_number: order.orderNumber, reason: reason || null, loss_option: lossOption },
    }).catch(() => {});

    notificationService.create({
      type: "order_cancelled",
      title: "Order Cancelled",
      message: `Order ${formatOrderNumber(order.orderNumber)} has been cancelled${reason ? ` (${reason})` : ""}`,
      referenceType: "order",
      referenceId: id,
    }).catch(() => {});

    // Real-time anomaly hooks (fire-and-forget, never block response)
    anomalyService.runScan(["refund_spike", "cancellation_spike"]).catch((err) => console.warn("[anomaly] hook scan dropped:", err?.message));

    return { order_id: id, action: "cancelled" };
  },

  /* ── Remove Single Item ────────────── */

  async removeOrderItem(orderId, orderItemId, userId, reason, options = {}) {
    const order = await orderRepository.findByIdGuard(orderId);
    if (!order) throw new AppError(404, "Order not found", "ORDER_NOT_FOUND");

    if (order.status !== "accepted" && order.status !== "preparing") {
      throw new AppError(400, "Only accepted or preparing orders can have items removed", "INVALID_STATUS");
    }

    const orderItem = await orderRepository.getOrderItemById(orderItemId);
    if (!orderItem || orderItem.orderId !== orderId) {
      throw new AppError(404, "Order item not found", "ORDER_ITEM_NOT_FOUND");
    }

    if (orderItem.isPrepared) {
      throw new AppError(400, "Cannot remove a prepared item — it has already been served", "ITEM_ALREADY_SERVED");
    }

    const lossOption = options.loss_option || "no_loss";
    const refundOption = options.refund_option || "partial";
    const ingredientLosses = options.ingredient_losses || [];

    // Fetch recipes for this item's variant
    const recipes = await orderRepository.getRecipesByVariantIds([orderItem.variantId]);
    const itemRecipes = recipes.filter((r) => r.variantId === orderItem.variantId);

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

    // Refund resolved inside the tx after totals are recomputed:
    // refund = net drop caused by the removal, capped at what was actually paid.
    let refundAmount = 0;

    await prisma.$transaction(async (tx) => {
      // Re-check inside the tx: the item may have been marked prepared, or the
      // order settled, between the pre-tx reads and now.
      const freshItem = await tx.orderItem.findUnique({
        where: { orderItemId },
        select: { isPrepared: true, orderId: true },
      });
      if (!freshItem || freshItem.orderId !== orderId) {
        throw new AppError(404, "Order item not found", "ORDER_ITEM_NOT_FOUND");
      }
      if (freshItem.isPrepared) {
        throw new AppError(400, "Cannot remove a prepared item — it has already been served", "ITEM_ALREADY_SERVED");
      }
      const freshOrder = await tx.order.findUnique({
        where: { orderId },
        select: { status: true },
      });
      if (!freshOrder || (freshOrder.status !== "accepted" && freshOrder.status !== "preparing")) {
        throw new AppError(409, "Order is no longer editable — it was settled concurrently", "ORDER_ALREADY_SETTLED");
      }

      if (lossOption === "no_loss") {
        // No loss: restore this item's ingredients
        await this._restoreIngredientsForSingleItem(orderItem, itemRecipes, deductions, tx, orderId, userId);
      } else {
        // With loss: create loss records, restore non-lost portions
        await this._createLossRecordsForSingleItem(orderId, orderItem, itemRecipes, userId, tx, ingredientLosses, itemCostMap);
        await this._restorePartialForSingleItem(orderItem, itemRecipes, ingredientLosses, deductions, tx, orderId, userId);
      }

      // Soft-delete the order item
      await orderRepository.removeOrderItem(orderItemId, { userId, reason, lossOption }, tx);

      // Recompute totals from remaining items (net of discount) — never
      // subtract a gross refund from a net total.
      const remainingItems = await tx.orderItem.findMany({
        where: { orderId, removedAt: null },
        select: { subtotal: true },
      });
      const remainingSubtotal = roundMoney(
        remainingItems.reduce((sum, i) => sum + Number(i.subtotal || 0), 0)
      );
      const discountInput = { discount_type: order.discountType ?? "none" };
      if (discountInput.discount_type === "promo") {
        if (Number(order.discountPercent) > 0) {
          discountInput.promo_mode = "percent";
          discountInput.promo_value = Number(order.discountPercent);
        } else {
          discountInput.promo_mode = "peso";
          discountInput.promo_value = Number(order.discountAmount) || 0;
        }
      }
      const priced = computeDiscountedTotal(remainingSubtotal, discountInput);
      const oldTotal = roundMoney(Number(order.totalAmount) || 0);
      await orderRepository.updateOrder(orderId, {
        subtotalAmount: remainingSubtotal,
        discountAmount: priced.discountAmount,
        discountPercent: priced.discountPercent,
        totalAmount: priced.total,
      }, tx);

      // Refund = net drop caused by the removal. Cumulative refunds can never
      // exceed what the customer paid (invariant: refunds + current total =
      // original total ≤ paid + change given). Note: cap is against paid,
      // NOT oldTotal — oldTotal shrinks with each removal.
      const paid = order.amountPaid != null ? Number(order.amountPaid) : oldTotal;
      const priorRefunded = Number(order.refund?.amount || 0);
      const maxRefundable = Math.max(0, roundMoney(paid - priorRefunded));
      const drop = roundMoney(oldTotal - priced.total);
      if (refundOption === "full") {
        refundAmount = Math.min(drop, maxRefundable);
      } else if (refundOption === "none") {
        refundAmount = 0;
      } else if (options.refund_amount != null) {
        refundAmount = Math.min(Number(options.refund_amount), drop, maxRefundable);
      } else {
        refundAmount = 0;
      }
      refundAmount = Math.max(0, roundMoney(refundAmount));

      // Count remaining items
      const remainingCount = await orderRepository.countOrderItems(orderId, tx);

      // If no items left, cancel the entire order
      if (remainingCount === 0) {
        await orderRepository.updateStatus(orderId, "cancelled", { userId }, tx);
        await orderRepository.createCancellation({
          orderId,
          cancelledBy: userId,
          reason: "all_items_removed",
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
          reason: itemLabel
            ? `${itemLabel} removed${reason ? ` — ${reason}` : ""} (${lossOption})`
            : `Item removed${reason ? ` — ${reason}` : ""} (${lossOption})`,
          refundedById: userId,
        }, tx);
      }
    }, { timeout: 15000 });

    if (affectedIngredientIds.length > 0) {
      productService.recomputeVariantAvailability(affectedIngredientIds).catch((err) => console.warn("[menu] availability recompute dropped:", err?.message));
    }

    auditLogService.logAction({
      userId,
      action: ACTIONS.ORDER_ITEM_REMOVED,
      targetType: "order_item",
      targetId: String(orderItemId),
      details: {
        order_id: orderId,
        order_number: order.orderNumber,
        product_name: orderItem.product?.productName,
        reason,
        loss_option: lossOption,
        refund_amount: refundAmount,
      },
    }).catch(() => {});

    const remainingCount = await orderRepository.countOrderItems(orderId);

    // Real-time anomaly hooks (fire-and-forget, never block response)
    if (refundAmount > 0) {
      anomalyService.runScan(["refund_spike", "cancellation_spike"]).catch((err) => console.warn("[anomaly] hook scan dropped:", err?.message));
    }

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

    const overridden = await orderRepository.overrideLoss(lossId, overrideData);

    auditLogService.logAction({
      userId,
      action: ACTIONS.LOSS_OVERRIDDEN,
      targetType: "loss_record",
      targetId: String(lossId),
      details: {
        reason: overrideReason,
        note: overrideNote,
        ingredient_id: overridden?.ingredientId ?? null,
        related_order_id: overridden?.relatedOrderId ?? null,
        quantity_lost: overridden?.quantityLost != null ? Number(overridden.quantityLost) : null,
      },
    }).catch(() => {});

    return { lossId, overrideReason };
  },

  /* ── BR-01: Pricing Helpers ──────────── */

  /**
   * Re-price items from live variant prices (server authoritative) and
   * compute subtotal -> discount -> net total.
   * @param {Array} items - [{ product_id, variant_id, quantity, unit_price }]
   * @param {object} discount - { discount_type, promo_mode, promo_value }
   * @returns {{ pricedItems, subtotal, discount, total }}
   */
  async _priceItemsAndTotals(items, discount = {}) {
    const variantIds = [...new Set(items.map((i) => i.variant_id))];
    const priceMap = await orderRepository.getVariantPrices(variantIds);

    const pricedItems = items.map((item) => {
      const livePrice = priceMap.get(item.variant_id);
      if (livePrice == null) {
        throw new AppError(400, `Variant ${item.variant_id} not found`, "VARIANT_NOT_FOUND");
      }
      if (Math.abs(Number(item.unit_price) - livePrice) > 0.01) {
        throw new AppError(409, "Menu price changed — please refresh and try again", "PRICE_CHANGED");
      }
      return { ...item, unit_price: livePrice };
    });

    const subtotal = roundMoney(
      pricedItems.reduce((sum, item) => sum + item.unit_price * item.quantity, 0)
    );
    const result = computeDiscountedTotal(subtotal, discount);
    return { pricedItems, subtotal, discount: result, total: result.total };
  },

  /**
   * Validate payment against net total. Cash needs paid >= total.
   * E-wallets are record-only: paid must equal total, change is 0.
   * Also rejects methods disabled in Settings → acceptedPayments.
   */
  async _assertPaymentValid({ amountPaid, total, paymentMethod = "cash" }) {
    const accepted = await settingsService.getAcceptedPayments();
    if (!accepted.includes(paymentMethod)) {
      throw new AppError(403, `${paymentMethod} is currently not accepted`, "PAYMENT_DISABLED");
    }
    if (amountPaid == null || Number(amountPaid) <= 0) {
      throw new AppError(400, "Amount paid is required", "PAYMENT_REQUIRED");
    }
    if (paymentMethod === "cash") {
      if (Number(amountPaid) < total) {
        throw new AppError(400, "Amount paid is less than total", "INSUFFICIENT_PAYMENT");
      }
      return;
    }
    if (Math.abs(Number(amountPaid) - total) > 0.01) {
      throw new AppError(400, "E-wallet amount must equal the order total", "INVALID_PAYMENT_AMOUNT");
    }
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

  async _deductIngredients(orderId, needs, tx, userId) {
    if (needs.size === 0) return { deductions: [], needs };

    // Phase 2: Single query to fetch all available batches for all ingredients
    const ingredientIds = [...needs.keys()];
    const allBatches = await orderRepository.getAllAvailableBatches(ingredientIds, tx);

    // Phase 2: Allocate deductions per ingredient (FIFO logic, in-memory)
    const deductPayloads = [];     // for bulk SQL: { restockId, quantity, version }
    const deductions = [];         // for createMany: deduction records
    const adjustments = [];        // for stock adjustment audit trail

    for (const [ingredientId, totalNeeded] of needs) {
      const batches = allBatches.get(ingredientId) || [];
      const stockBefore = batches.reduce((sum, b) => sum + Number(b.quantityLeft), 0);
      let remaining = totalNeeded;

      for (const batch of batches) {
        if (remaining <= 0) break;
        const available = Number(batch.quantityLeft);
        const toDeduct = Math.min(remaining, available);

        deductPayloads.push({
          restockId: batch.restockId,
          quantity: toDeduct,
          version: batch.version,
        });

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

      if (userId) {
        adjustments.push({
          ingredientId,
          adjustedById: userId,
          adjustmentType: "deduction",
          quantityBefore: stockBefore,
          quantityChanged: -totalNeeded,
          quantityAfter: stockBefore - totalNeeded,
          relatedOrderId: orderId,
        });
      }
    }

    // Phase 2: Single bulk UPDATE instead of N*M individual updates
    const rowsUpdated = await orderRepository.bulkDeductBatches(deductPayloads, tx);
    if (rowsUpdated !== deductPayloads.length) {
      throw new AppError(400, "Insufficient ingredient stock (concurrent modification)", "INSUFFICIENT_STOCK");
    }

    // Final batch writes: 2 queries total (createMany × 2)
    if (deductions.length > 0) {
      await orderRepository.createDeductions(deductions, tx);
    }
    if (adjustments.length > 0) {
      await tx.stockAdjustment.createMany({ data: adjustments });
    }

    return { deductions, needs };
  },

  /**
   * Check stock levels and fire notifications AFTER transaction commits.
   * Runs outside the transaction to avoid timeout — uses regular prisma client.
   * @param {Map<string, number>} needs - ingredientId -> quantity deducted
   */
  async _checkStockLevels(needs) {
    const ingredientIds = [...needs.keys()];
    const [stockMap, infoMap] = await Promise.all([
      orderRepository.getIngredientsTotalStocks(ingredientIds),
      orderRepository.getIngredientsBasic(ingredientIds),
    ]);

    for (const ingredientId of ingredientIds) {
      const stockAfter = stockMap.get(ingredientId) ?? 0;
      const ing = infoMap.get(ingredientId);
      if (!ing) continue;

      // Crossing-only: skip ingredients that were already out/low before this
      // deduction, so repeated orders don't spam duplicate alerts.
      const stockBefore = stockAfter + (needs.get(ingredientId) ?? 0);
      const threshold = Number(ing.minimumThreshold);

      if (stockAfter <= 0) {
        if (stockBefore <= 0) continue;
        notificationService.create({
          type: "stock_out",
          title: "Out of Stock",
          message: `${ing.ingredientName} is now out of stock`,
          referenceType: "ingredient",
          referenceId: ingredientId,
        }).catch(() => {});
      } else if (stockAfter <= threshold) {
        if (stockBefore <= threshold) continue;
        notificationService.create({
          type: "stock_low",
          title: "Low Stock Alert",
          message: `${ing.ingredientName} is running low — ${stockAfter} ${ing.unit} remaining`,
          referenceType: "ingredient",
          referenceId: ingredientId,
        }).catch(() => {});
      }
    }
  },

  async _restoreIngredients(orderId, userId, tx) {
    const deductions = await orderRepository.getActiveDeductions(orderId, tx);

    // Group deductions by ingredient to calculate total restored per ingredient
    const restoreByIngredient = new Map();
    for (const deduction of deductions) {
      const key = deduction.ingredientId;
      restoreByIngredient.set(key, (restoreByIngredient.get(key) || 0) + Number(deduction.quantityDeducted));
    }

    await this._bulkRestoreBatches(
      deductions.map((d) => ({ restockBatchId: d.restockBatchId, qty: Number(d.quantityDeducted) })),
      tx,
    );

    await orderRepository.reverseDeductions(orderId, userId, tx);

    // Create stock adjustment records for audit trail (batch query for stocks)
    if (userId) {
      const ingredientIds = [...restoreByIngredient.keys()];
      const stockMap = await orderRepository.getIngredientsTotalStocks(ingredientIds, tx);
      const adjustments = [];
      for (const [ingredientId, totalRestored] of restoreByIngredient) {
        const currentStock = stockMap.get(ingredientId) || 0;
        adjustments.push({
          ingredientId,
          adjustedById: userId,
          adjustmentType: "manual",
          quantityBefore: currentStock - totalRestored,
          quantityChanged: totalRestored,
          quantityAfter: currentStock,
          relatedOrderId: orderId,
          notes: "Order cancelled — stock restored",
        });
      }
      if (adjustments.length > 0) {
        await tx.stockAdjustment.createMany({ data: adjustments });
      }
    }
  },

  /**
   * Version-guarded bulk restore: credits slices back to batches in one SQL
   * statement, aborting with 409 when a concurrent writer changed a batch.
   * Slices targeting the same batch are summed (SQL CASE matches first row only).
   * @param {Array<{restockBatchId: number, qty: number}>} slices
   * @param {object} tx - transaction client
   */
  async _bulkRestoreBatches(slices, tx) {
    const byBatch = new Map();
    for (const s of slices) {
      if (!s.qty || s.qty <= 0) continue;
      byBatch.set(s.restockBatchId, (byBatch.get(s.restockBatchId) || 0) + Number(s.qty));
    }
    if (byBatch.size === 0) return;

    const batches = await tx.restockBatch.findMany({
      where: { restockId: { in: [...byBatch.keys()] } },
      select: { restockId: true, version: true },
    });
    const versionMap = new Map(batches.map((b) => [b.restockId, b.version]));
    const items = [...byBatch.entries()].map(([restockId, quantity]) => ({
      restockId,
      quantity,
      version: versionMap.get(restockId),
    }));
    // A batch read at deduct time may have been consumed/deleted since —
    // treat a missing version as a concurrent modification, not a silent skip.
    if (items.some((i) => i.version == null)) {
      throw new AppError(409, "Stock changed during restore — please retry", "CONCURRENT_STOCK");
    }
    const rows = await orderRepository.bulkRestoreBatches(items, tx);
    if (rows !== items.length) {
      throw new AppError(409, "Stock changed during restore — please retry", "CONCURRENT_STOCK");
    }
  },

  async _restoreIngredientsForItems(orderId, unpreparedItems, tx, userId) {
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
    const slices = [];
    for (const deduction of allDeductions) {
      const remaining = restoreTracker.get(deduction.ingredientId) || 0;
      if (remaining <= 0) continue;

      const restoreQty = Math.min(remaining, Number(deduction.quantityDeducted));
      if (restoreQty > 0) {
        slices.push({ restockBatchId: deduction.restockBatchId, qty: restoreQty });
        restoreTracker.set(deduction.ingredientId, remaining - restoreQty);
      }
    }
    await this._bulkRestoreBatches(slices, tx);

    // Audit what was actually restored (needs minus unmet remainder).
    const restoredByIngredient = new Map();
    for (const [ingredientId, needed] of restoreNeeds) {
      const restored = needed - (restoreTracker.get(ingredientId) || 0);
      if (restored > 0) restoredByIngredient.set(ingredientId, restored);
    }

    // Create stock adjustment records for audit trail
    if (userId) {
      const restoreIngredientIds = [...restoredByIngredient.keys()];
      if (restoreIngredientIds.length > 0) {
        const stockMap = await orderRepository.getIngredientsTotalStocks(restoreIngredientIds, tx);
        const adjustments = [];
        for (const ingredientId of restoreIngredientIds) {
          const totalRestored = restoredByIngredient.get(ingredientId);
          const currentStock = stockMap.get(ingredientId) || 0;
          adjustments.push({
            ingredientId,
            adjustedById: userId,
            adjustmentType: "manual",
            quantityBefore: currentStock - totalRestored,
            quantityChanged: totalRestored,
            quantityAfter: currentStock,
            relatedOrderId: orderId,
            notes: "Order cancelled — unprepared items restored",
          });
        }
        if (adjustments.length > 0) {
          await tx.stockAdjustment.createMany({ data: adjustments });
        }
      }
    }
  },

  async _restorePartialItems(orderId, preparedItems, itemLosses, tx, userId) {
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
          const lossEntry = (itemLosses.find((e) => e.order_item_id === item.orderItemId))
            ?.ingredient_losses?.find((il) => il.ingredient_id === recipe.ingredientId);
          const lostQty = lossEntry ? Number(lossEntry.quantity_lost) : totalNeeded;
          const restoreQty = totalNeeded - lostQty;
          if (restoreQty > 0) {
            restoreNeeds.set(recipe.ingredientId, (restoreNeeds.get(recipe.ingredientId) || 0) + restoreQty);
          }
        } else {
          restoreNeeds.set(recipe.ingredientId, (restoreNeeds.get(recipe.ingredientId) || 0) + totalNeeded);
        }
      }
    }

    // Carry the unmet remainder across ALL matching deductions (FIFO) instead
    // of zeroing after the first batch — needs may span multiple batches.
    const originalNeeds = new Map(restoreNeeds);
    const slices = [];
    for (const deduction of allDeductions) {
      const remaining = restoreNeeds.get(deduction.ingredientId) || 0;
      if (remaining <= 0) continue;

      const restoreQty = Math.min(remaining, Number(deduction.quantityDeducted));
      if (restoreQty > 0) {
        slices.push({ restockBatchId: deduction.restockBatchId, qty: restoreQty });
        restoreNeeds.set(deduction.ingredientId, remaining - restoreQty);
      }
    }
    await this._bulkRestoreBatches(slices, tx);

    // Audit what was actually restored (original need minus unmet remainder).
    // restoreNeeds now holds only the unrestored leftover — never audit that.
    const restoredByIngredient = new Map();
    for (const [ingredientId, needed] of originalNeeds) {
      const restored = needed - (restoreNeeds.get(ingredientId) || 0);
      if (restored > 0) restoredByIngredient.set(ingredientId, restored);
    }

    // Create stock adjustment records for audit trail (partial restore)
    if (userId) {
      const restoreIngredientIds = [...restoredByIngredient.keys()];
      if (restoreIngredientIds.length > 0) {
        const stockMap = await orderRepository.getIngredientsTotalStocks(restoreIngredientIds, tx);
        const adjustments = [];
        for (const ingredientId of restoreIngredientIds) {
          const totalRestored = restoredByIngredient.get(ingredientId);
          const currentStock = stockMap.get(ingredientId) || 0;
          adjustments.push({
            ingredientId,
            adjustedById: userId,
            adjustmentType: "manual",
            quantityBefore: currentStock - totalRestored,
            quantityChanged: totalRestored,
            quantityAfter: currentStock,
            relatedOrderId: orderId,
            notes: "Order cancelled — partial restore (with loss)",
          });
        }
        if (adjustments.length > 0) {
          await tx.stockAdjustment.createMany({ data: adjustments });
        }
      }
    }
  },

  /* ── Single-Item Restore/Loss Helpers ── */

  /**
   * Restore ingredients for a single item proportionally from deductions.
   */
  async _restoreIngredientsForSingleItem(orderItem, itemRecipes, allDeductions, tx, orderId, userId) {
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

    const slices = [];
    for (const deduction of allDeductions) {
      const remaining = restoreTracker.get(deduction.ingredientId) || 0;
      if (remaining <= 0) continue;

      const restoreQty = Math.min(remaining, Number(deduction.quantityDeducted));
      if (restoreQty > 0) {
        slices.push({ restockBatchId: deduction.restockBatchId, qty: restoreQty });
        restoreTracker.set(deduction.ingredientId, remaining - restoreQty);
      }
    }
    await this._bulkRestoreBatches(slices, tx);

    // Create stock adjustment records for audit trail
    if (userId && orderId) {
      const ingredientIds = [...needs.keys()];
      if (ingredientIds.length > 0) {
        const stockMap = await orderRepository.getIngredientsTotalStocks(ingredientIds, tx);
        const adjustments = [];
        for (const [ingredientId, totalNeeded] of needs) {
          const currentStock = stockMap.get(ingredientId) || 0;
          adjustments.push({
            ingredientId,
            adjustedById: userId,
            adjustmentType: "manual",
            quantityBefore: currentStock - totalNeeded,
            quantityChanged: totalNeeded,
            quantityAfter: currentStock,
            relatedOrderId: orderId,
            notes: "Item removed — stock restored",
          });
        }
        if (adjustments.length > 0) {
          await tx.stockAdjustment.createMany({ data: adjustments });
        }
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

    const lossRows = [];
    for (const recipe of itemRecipes) {
      const totalNeeded = Number(recipe.quantityNeeded) * orderItem.quantity;
      const quantityLost = lossMap.has(recipe.ingredientId)
        ? Number(lossMap.get(recipe.ingredientId))
        : totalNeeded;

      if (quantityLost <= 0) continue;

      const costPerUnit = deductionCostMap.get(recipe.ingredientId) || 0;

      lossRows.push({
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
      });
    }
    await orderRepository.createOrderItemLosses(lossRows, tx);
  },

  /**
   * Restore non-lost portion of a single checked item's ingredients.
   */
  async _restorePartialForSingleItem(orderItem, itemRecipes, ingredientLosses, allDeductions, tx, orderId, userId) {
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
        restoreNeeds.set(recipe.ingredientId, (restoreNeeds.get(recipe.ingredientId) || 0) + totalNeeded);
      }
    }

    const restoreTracker = new Map(restoreNeeds);
    const slices = [];
    for (const deduction of allDeductions) {
      const remaining = restoreTracker.get(deduction.ingredientId) || 0;
      if (remaining <= 0) continue;

      const restoreQty = Math.min(remaining, Number(deduction.quantityDeducted));
      if (restoreQty > 0) {
        slices.push({ restockBatchId: deduction.restockBatchId, qty: restoreQty });
        restoreTracker.set(deduction.ingredientId, remaining - restoreQty);
      }
    }
    await this._bulkRestoreBatches(slices, tx);

    // Create stock adjustment records for audit trail (partial restore)
    if (userId && orderId) {
      const restoreIngredientIds = [...restoreNeeds.keys()].filter(id => restoreNeeds.get(id) > 0);
      if (restoreIngredientIds.length > 0) {
        const stockMap = await orderRepository.getIngredientsTotalStocks(restoreIngredientIds, tx);
        const adjustments = [];
        for (const ingredientId of restoreIngredientIds) {
          const totalRestored = restoreNeeds.get(ingredientId);
          const currentStock = stockMap.get(ingredientId) || 0;
          adjustments.push({
            ingredientId,
            adjustedById: userId,
            adjustmentType: "manual",
            quantityBefore: currentStock - totalRestored,
            quantityChanged: totalRestored,
            quantityAfter: currentStock,
            relatedOrderId: orderId,
            notes: "Item removed — partial restore (with loss)",
          });
        }
        if (adjustments.length > 0) {
          await tx.stockAdjustment.createMany({ data: adjustments });
        }
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

    const lossRows = [];
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

        lossRows.push({
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
        });
      }
    }
    await orderRepository.createOrderItemLosses(lossRows, tx);
  },

  /* ── Acceptance Handler ──────────────── */

  async _handleAcceptance(id, order, meta) {
    if (!meta.amountPaid) {
      throw new AppError(400, "Amount paid is required for acceptance", "PAYMENT_REQUIRED");
    }

    // BR-02: payment requires an open drawer session.
    const { shiftId } = await shiftService.resolveShiftForUser(meta.userId);

    // Re-price from live variant prices so acceptance can't use stale totals.
    const orderItems = order.items.map((item) => ({
      product_id: item.productId,
      variant_id: item.variantId,
      quantity: item.quantity,
      unit_price: Number(item.unitPrice),
    }));
    const { subtotal, discount: discountResult, total } =
      await this._priceItemsAndTotals(orderItems, {
        discount_type: meta.discount_type,
        promo_mode: meta.promo_mode,
        promo_value: meta.promo_value,
      });

    await this._assertPaymentValid({ amountPaid: meta.amountPaid, total, paymentMethod: meta.payment_method });

    const paymentMethod = meta.payment_method ?? order.paymentMethod ?? "cash";
    const change = paymentMethod === "cash" ? roundMoney(meta.amountPaid - total) : 0;
    const paidToStore = paymentMethod === "cash" ? meta.amountPaid : total;

    // Batch recipe lookup (1 query instead of N per-item queries)
    const ingredientNeeds = await this._aggregateIngredientNeeds(orderItems);

    let transactionNeeds;

    await prisma.$transaction(async (tx) => {
      // Claim first: a concurrent accept loses here instead of double-deducting.
      const claimed = await orderRepository.claimStatus(id, "pending", "accepted", tx);
      if (claimed === 0) {
        throw new AppError(409, "Order is no longer pending — it was settled concurrently", "ORDER_ALREADY_SETTLED");
      }

      const { needs } = await this._deductIngredients(id, ingredientNeeds, tx, meta.userId);
      transactionNeeds = needs;
      await orderRepository.upsertReceipt({
        orderId: id,
        issuedBy: meta.userId,
        totalAmount: total,
      }, tx);
      await orderRepository.updateStatus(id, "accepted", {
        userId: meta.userId,
        subtotalAmount: subtotal,
        discountType: discountResult.discountType,
        discountPercent: discountResult.discountPercent,
        discountLabel: meta.discount_label ?? null,
        discountIdNo: meta.discount_id_no ?? null,
        discountAmount: discountResult.discountAmount,
        discountBy: discountResult.discountType === "none" ? null : meta.userId,
        paymentMethod,
        referenceNo: meta.reference_no ?? null,
        shiftId,
        totalAmount: total,
        amountPaid: paidToStore,
        change,
      }, tx);
    }, { timeout: 15000 });

    const affectedIngredientIds = [...ingredientNeeds.keys()];
    productService.recomputeVariantAvailability(affectedIngredientIds).catch((err) => console.warn("[menu] availability recompute dropped:", err?.message));
    this._checkStockLevels(transactionNeeds).catch(() => {});

    return this.getById(id);
  },
};
