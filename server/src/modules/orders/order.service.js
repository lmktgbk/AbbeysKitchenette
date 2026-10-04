import { orderRepository } from "./order.repository.js";
import { formatOrderResponse, formatOrderItemResponse, composeOrderNumber, formatOrderNumber } from "./order.response.js";
import { orderPricing, aggregateLineDiscounts, roundMoney } from "./order.pricing.js";
import { assertStatusPermission, isValidTransition } from "./order.policy.js";
import { allocateConsumption, planSettlement, stockUnits } from "./order.consumption.js";
import { orderRequest, orderIdempotency } from "./order.idempotency.js";
import { shiftService } from "../shifts/shift.service.js";
import { AppError } from "../../middleware/errorHandler.middleware.js";
import prisma from "../../config/prisma.js";
import { recordEffects } from "../../infrastructure/effects/domainEffects.js";
import { lockStock } from "../ingredients/ingredient.lock.js";
import { ACTIONS } from "../auditLogs/auditLog.constants.js";
import { getBusinessDate } from "../../config/time.js";

import { recordSheetEvent } from "../sheets/sheets.outbox.js";

export const orderService = {
  ...orderPricing,
  /* ── Queries ─────────────────────────── */

  async getAll({ page = 1, limit = 50, search, status, dateFrom, dateTo, timeFrom, timeTo, sortBy, sortDir, staffId, scope }) {
    const skip = (page - 1) * limit;

    const [rows, totalItems] = await Promise.all([
      orderRepository.findManyPaginated({ skip, take: limit, search, status, dateFrom, dateTo, timeFrom, timeTo, sortBy, sortDir, staffId, scope }),
      orderRepository.countFiltered({ search, status, dateFrom, dateTo, timeFrom, timeTo, staffId, scope }),
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

  /**
   * Status counts for KPI cards, optionally scoped to order_date range.
   * @param {object} [filters] - { dateFrom?: "YYYY-MM-DD", dateTo?: "YYYY-MM-DD", scope?: "active" | "all" }
   */
  async getStats({ dateFrom, dateTo, scope } = {}) {
    return orderRepository.countByStatus({ dateFrom, dateTo, scope });
  },

  async getById(id) {
    const order = await orderRepository.findById(id);
    if (!order) throw new AppError(404, "Order not found", "ORDER_NOT_FOUND");

    // Paid orders expose their original consumption to loss dialogs. Current
    // recipes are only meaningful before payment or for historical display.
    const variantIds = [...new Set(order.items.map(item => item.variantId))];
    const [consumption, recipes, deductionCosts, lossRecords] = await Promise.all([
      order.consumptionRecordedAt ? orderRepository.getItemConsumption(id) : [],
      !order.consumptionRecordedAt && variantIds.length ? orderRepository.getRecipesByVariantIds(variantIds) : [],
      order.consumptionRecordedAt ? [] : orderRepository.getDeductionIngredientCosts(id),
      orderRepository.getOrderItemLosses(id),
    ]);
    const recipeMap = new Map(), itemRecipeMap = new Map();
    if (order.consumptionRecordedAt) {
      for (const row of consumption) {
        if (!itemRecipeMap.has(row.orderItemId)) itemRecipeMap.set(row.orderItemId, new Map());
        const byIngredient = itemRecipeMap.get(row.orderItemId);
        const aggregate = byIngredient.get(row.ingredientId) || { ingredientId: row.ingredientId, ingredient: row.ingredient, quantity: 0, cost: 0 };
        aggregate.quantity += Number(row.quantityDeducted);
        aggregate.cost += Number(row.quantityDeducted) * Number(row.costPerUnit);
        byIngredient.set(row.ingredientId, aggregate);
      }
    } else {
      for (const recipe of recipes) {
        if (!recipeMap.has(recipe.variantId)) recipeMap.set(recipe.variantId, []);
        recipeMap.get(recipe.variantId).push(recipe);
      }
    }

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
      consumption_history_available: !!order.consumptionRecordedAt,
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
        consumption_history_available: !!order.consumptionRecordedAt,
        recipes: (order.consumptionRecordedAt
          ? [...(itemRecipeMap.get(item.orderItemId)?.values() || [])].map(row => ({ ...row, quantityNeeded: row.quantity / item.quantity, originalCost: row.quantity ? row.cost / row.quantity : 0 }))
          : recipeMap.get(item.variantId) || []).map((r) => ({
          ingredient_id: r.ingredientId,
          ingredient_name: r.ingredient?.ingredientName ?? null,
          quantity_needed: Number(r.quantityNeeded),
          cost_per_unit: r.originalCost ?? deductionCostMap.get(r.ingredientId) ?? 0,
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

  /** Create a paid order once; shift, stock, receipt, and follow-up intent commit with its replay result. */
  async createWalkIn({ customerName, tableNumber, items, amountPaid, createdBy, discount = {}, payment = {}, idempotencyKey }) {
    const request = orderRequest(`walk-in:${createdBy}`, idempotencyKey, { customerName, tableNumber, items, amountPaid, discount, payment });
    const cached = await orderIdempotency.lookup(request);
    if (cached) return cached;
    // Price outside the transaction; the open shift is locked at commit time.
    const { pricedItems, subtotal, discount: discountResult, total } = await this._priceItemsAndTotals(items, discount);

    await this._assertPaymentValid({ amountPaid, total, paymentMethod: payment.payment_method });

    const paymentMethod = payment.payment_method ?? "cash";
    const change = paymentMethod === "cash" ? roundMoney(amountPaid - total) : 0;
    const identity = this._resolveDiscountIdentity(discount, pricedItems, discountResult.discountType);

    const { needs: aggregatedIngredients, recipes: consumptionRecipes } = await this._aggregateIngredientNeeds(pricedItems);

    const order = await prisma.$transaction(async (tx) => {
      const replay = await orderIdempotency.claim(request, tx);
      if (replay) return { replay };
      const { shiftId } = await shiftService.resolveShiftForUser(createdBy, tx);
      const now = new Date();
      // Business date is DB-clock Manila — client-supplied order_date is
      // never trusted (device clocks lie). See config/time.js.
      const businessDay = await getBusinessDate(tx);
      const orderDate = new Date(businessDay + "T00:00:00Z");
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
        discountLabel: identity.discountLabel,
        discountIdNo: identity.discountIdNo,
        seniorIdNo: identity.seniorIdNo,
        pwdIdNo: identity.pwdIdNo,
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
        discountType: item.discountType ?? "none",
        discountPercent: item.discountPercent ?? 0,
        discountAmount: item.discountAmount ?? 0,
        discountLabel: item.discountLabel ?? null,
      })), tx);

      const { deductions, needs } = await this._deductIngredients(newOrder.orderId, aggregatedIngredients, tx, createdBy, consumptionRecipes);
      // BR-03: issuance record for the receipt/ledger (reprint-safe).
      await orderRepository.upsertReceipt({
        orderId: newOrder.orderId,
        issuedBy: createdBy,
        totalAmount: total,
      }, tx);
      await recordSheetEvent(tx, newOrder.orderId, "paid");
      await recordEffects(tx, { audit: {
        userId: createdBy,
        action: ACTIONS.ORDER_CREATED,
        targetType: "order",
        targetId: newOrder.orderId,
        details: { order_number: newOrder.orderNumber, subtotal, discount: discountResult.discountAmount, total, source: "walk_in", paymentMethod },
      }, notifications: [{
        type: "order_new",
        title: "New Walk-In Order",
        message: `Order ${formatOrderNumber(newOrder.orderNumber)} from ${customerName} — ₱${total.toFixed(2)}`,
        referenceType: "order",
        referenceId: newOrder.orderId,
      }] });
      await orderIdempotency.complete(request, { order_id: newOrder.orderId, order_number: newOrder.orderNumber }, tx);
      return { order: newOrder, deductions, needs };
    }, { timeout: 15000 });

    if (order.replay) return order.replay;

    // Light response: POS only needs the id for receipt printing (the full
    // detail reloads via GET /:id and list invalidation). Skips the 4-query
    // getById tail on the hot path.
    return { order_id: order.order.orderId, order_number: order.order.orderNumber };
  },

  /* ── Online Order Creation (Guest) ──── */

  /** Save an unpaid guest order; payment and stock reservation occur later during acceptance. */
  async createOnline({ customerName, tableNumber, items, guestToken, idempotencyKey, beforeCreate }) {
    const request = orderRequest("guest-order", idempotencyKey, { customerName, tableNumber, items });
    const cached = await orderIdempotency.lookup(request);
    if (cached) return cached;
    await beforeCreate?.();
    // Server re-price so guests can't tamper with totals (no discount at placement).
    const { pricedItems, total } = await this._priceItemsAndTotals(items, { discount_type: "none" });

    let orderNumber;

    const result = await prisma.$transaction(async (tx) => {
      const replay = await orderIdempotency.claim(request, tx);
      if (replay) return { replay };
      // DB-clock Manila business date — never client-supplied.
      const businessDay = await getBusinessDate(tx);
      const orderDate = new Date(businessDay + "T00:00:00Z");
      // Assigned to the outer binding below — the light response tail
      // needs the number without a getById refetch.
      orderNumber = composeOrderNumber(orderDate, await orderRepository.getNextOrderNumber(orderDate, tx));

      const row = await orderRepository.createOnlineOrder({
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
      const response = { order_id: row.orderId, order_number: orderNumber, guest_token: guestToken, total_amount: total, created_at: row.createdAt.toISOString() };
      await recordEffects(tx, { audit: {
        action: ACTIONS.ORDER_CREATED,
        targetType: "order",
        targetId: row.orderId,
        details: { order_number: orderNumber, total, source: "online" },
      }, notifications: [{
        type: "order_new",
        title: "New Online Order",
        message: `Order ${formatOrderNumber(orderNumber)} from ${customerName} — ₱${total.toFixed(2)}`,
        referenceType: "order",
        referenceId: row.orderId,
      }] });
      await orderIdempotency.complete(request, response, tx);
      return { row, response };
    }, { timeout: 15000 });

    // Light response: POS only needs the id for receipt printing (the full
    // detail reloads via GET /:id and list invalidation). Skips the 4-query
    // getById tail on the hot path.
    if (result.replay) return result.replay;
    const created = result.response;

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
      await recordEffects(tx, { audit: {
        userId,
        action: ACTIONS.ORDER_UPDATED,
        targetType: "order",
        targetId: id,
        details: { order_number: existing.orderNumber, fields: editedFields },
      } });
    }, { timeout: 15000 });
    // Read AFTER commit via the global client so the response reflects the edit.
    const result = await this.getById(id);

    return result;
  },

  /* ── Fulfill Pending Online Order ──── */

  async fulfillPendingOrder({ id, customerName, tableNumber, items, amountPaid, userId, discount = {}, payment = {}, idempotencyKey }) {
    const request = orderRequest(`fulfill:${id}:${userId}`, idempotencyKey, { customerName, tableNumber, items, amountPaid, discount, payment });
    const cached = await orderIdempotency.lookup(request);
    if (cached) return cached;
    const existing = await orderRepository.findPendingById(id);
    if (!existing) {
      const replay = await orderIdempotency.lookup(request);
      if (replay) return replay;
      throw new AppError(404, "Pending order not found", "ORDER_NOT_FOUND");
    }
    if (existing.status !== "pending") {
      throw new AppError(400, "Only pending orders can be fulfilled", "INVALID_STATUS");
    }

    // Price outside the transaction; the open shift is locked at commit time.
    const { pricedItems, subtotal, discount: discountResult, total } = await this._priceItemsAndTotals(items, discount);

    await this._assertPaymentValid({ amountPaid, total, paymentMethod: payment.payment_method });

    const paymentMethod = payment.payment_method ?? "cash";
    const change = paymentMethod === "cash" ? roundMoney(amountPaid - total) : 0;
    const paidToStore = paymentMethod === "cash" ? amountPaid : total;
    const identity = this._resolveDiscountIdentity(discount, pricedItems, discountResult.discountType);

    const { needs: aggregatedIngredients, recipes: consumptionRecipes } = await this._aggregateIngredientNeeds(pricedItems);

    let transactionNeeds;

    const outcome = await prisma.$transaction(async (tx) => {
      const replay = await orderIdempotency.claim(request, tx);
      if (replay) return replay;
      const { shiftId } = await shiftService.resolveShiftForUser(userId, tx);
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
        discountType: item.discountType ?? "none",
        discountPercent: item.discountPercent ?? 0,
        discountAmount: item.discountAmount ?? 0,
        discountLabel: item.discountLabel ?? null,
      })), tx);

      const { needs } = await this._deductIngredients(id, aggregatedIngredients, tx, userId, consumptionRecipes);
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
        discountLabel: identity.discountLabel,
        discountIdNo: identity.discountIdNo,
        seniorIdNo: identity.seniorIdNo,
        pwdIdNo: identity.pwdIdNo,
        discountAmount: discountResult.discountAmount,
        discountBy: discountResult.discountType === "none" ? null : userId,
        paymentMethod,
        referenceNo: payment.reference_no ?? null,
        shiftId,
        totalAmount: total,
        amountPaid: paidToStore,
        change,
      }, tx);
      await recordSheetEvent(tx, id, "paid");
      await recordEffects(tx, { audit: {
        userId,
        action: ACTIONS.ORDER_ACCEPTED,
        targetType: "order",
        targetId: id,
        details: { order_number: existing.orderNumber, subtotal, discount: discountResult.discountAmount, total, source: "online", paymentMethod },
      } });
      return orderIdempotency.complete(request, { order_id: id, order_number: existing.orderNumber }, tx);
    }, { timeout: 15000 });

    if (!transactionNeeds) return outcome;

    // Light response (same rationale as createWalkIn above).
    return outcome;
  },

  /* ── Status Transitions ──────────────── */

  async advanceStatus(id, targetStatus, meta = {}) {
    assertStatusPermission(meta.userRole, targetStatus);
    let request;
    if (targetStatus === "accepted") {
      const { idempotencyKey, userId, userRole: _userRole, ...payload } = meta;
      request = orderRequest(`accept:${id}:${userId}`, idempotencyKey, payload);
      const cached = await orderIdempotency.lookup(request);
      if (cached) return cached;
    }
    if (targetStatus === "preparing") return this.prepareOrder(id, meta.userId);
    const order = await orderRepository.findById(id);
    if (!order) throw new AppError(404, "Order not found", "ORDER_NOT_FOUND");

    if (!isValidTransition(order.status, targetStatus)) {
      if (request) {
        const replay = await orderIdempotency.lookup(request);
        if (replay) return replay;
      }
      throw new AppError(409, `Order is now "${order.status}". Refresh the order before trying again`, "ORDER_STATE_CONFLICT");
    }

    if (targetStatus === "completed") {
      const createdAt = new Date(order.createdAt).getTime();
      const fulfillmentMinutes = Math.round((Date.now() - createdAt) / 60000);

      // Check + flip inside one tx: items can't slip to unprepared between
      // the check and the update, and a concurrent settle loses the claim.
      await prisma.$transaction(async (tx) => {
        const current = await orderRepository.lockOrder(id, tx);
        if (!current) throw new AppError(404, "Order not found", "ORDER_NOT_FOUND");
        if (!isValidTransition(current.status, "completed")) {
          throw new AppError(409, "Order is no longer ready for completion. Refresh the order", "ORDER_STATE_CONFLICT");
        }
        const items = await orderRepository.getOrderItems(id, tx);
        if (items.length === 0 || !items.every((i) => i.isPrepared)) {
          throw new AppError(400, "All items must be marked as prepared before completing", "NOT_ALL_PREPARED");
        }
        const claimed = await orderRepository.claimStatus(id, "preparing", "completed", tx);
        if (claimed === 0) {
          throw new AppError(409, "Order is no longer completable — it was settled concurrently", "ORDER_ALREADY_SETTLED");
        }
        await orderRepository.updateStatus(id, "completed", { userId: meta.userId, fulfillmentMinutes }, tx);
        await recordEffects(tx, { audit: {
          userId: meta.userId,
          action: ACTIONS.ORDER_COMPLETED,
          targetType: "order",
          targetId: id,
          details: { order_number: current.order_number, total: Number(current.total_amount), fulfillmentMinutes },
        }, notifications: [{
          type: "order_completed",
          title: "Order Completed",
          message: `Order ${formatOrderNumber(current.order_number)} completed in ${fulfillmentMinutes} min — ₱${Number(current.total_amount).toFixed(2)}`,
          referenceType: "order",
          referenceId: id,
        }] });

      }, { timeout: 15000 });


      return this.getById(id);
    }

    if (targetStatus === "accepted") {
      const { response: result, replayed } = await this._handleAcceptance(id, order, meta, request);
      if (replayed) return result;

      return result;
    }
  },

  /* ── Prepare Order ───────────────────── */

  /** Claim accepted-to-preparing atomically so a stale preparation action cannot revive cancellation. */
  async prepareOrder(id, userId) {
    const order = await orderRepository.findByIdGuard(id);
    if (!order) throw new AppError(404, "Order not found", "ORDER_NOT_FOUND");

    await prisma.$transaction(async (tx) => {
      const claimed = await orderRepository.updateStatus(id, "preparing", { userId }, tx, "accepted");
      if (claimed === 0) {
        throw new AppError(409, "Order is no longer accepted. Refresh the order before preparing", "ORDER_STATE_CONFLICT");
      }
      await recordEffects(tx, { audit: {
        userId,
        action: ACTIONS.ORDER_PREPARING,
        targetType: "order",
        targetId: id,
        details: { order_number: order.orderNumber },
      } });
    });

    return this.getById(id);
  },

  /* ── Check Order Item ────────────────── */

  /** Serialize item preparation changes with completion/removal using the owning order's row lock. */
  async checkOrderItem(orderId, orderItemId, isPrepared, userId) {
    await prisma.$transaction(async (tx) => {
      const order = await orderRepository.lockOrder(orderId, tx);
      if (!order) throw new AppError(404, "Order not found", "ORDER_NOT_FOUND");
      if (!["accepted", "preparing"].includes(order.status)) {
        throw new AppError(409, "Order is no longer available for preparation. Refresh the order", "ORDER_STATE_CONFLICT");
      }
      const result = await orderRepository.setOrderItemPrepared(orderId, orderItemId, isPrepared, userId, tx);
      if (result.count !== 1) throw new AppError(404, "Order item not found", "ORDER_ITEM_NOT_FOUND");
    });

    return this.getById(orderId);
  },

  /* ── Cancel / Delete ─────────────────── */

  async cancelOrDelete(id, userId, reason, options = {}) {
    let order;
    let lossOption = options.loss_option || "no_loss";
    await prisma.$transaction(async (tx) => {
      const locked = await orderRepository.lockOrder(id, tx);
      if (!locked) throw new AppError(404, "Order not found", "ORDER_NOT_FOUND");
      order = await orderRepository.findByIdGuard(id, tx);
      if (!order) throw new AppError(404, "Order not found", "ORDER_NOT_FOUND");

      if (!["pending", "accepted", "preparing"].includes(order.status)) {
        throw new AppError(409, "Order is no longer cancellable. Refresh the order", "ORDER_STATE_CONFLICT");
      }

      const orderItems = await orderRepository.getOrderItems(id, tx);
      const deductions = (order.status === "accepted" || order.status === "preparing")
        ? await orderRepository.getActiveDeductions(id, tx)
        : [];

      // Determine loss handling based on options
      const refundOption = options.refund_option || "partial"; // "full" | "partial" | "none"
      const itemLosses = options.item_losses || []; // [{ item_id, ingredient_losses: [{ ingredient_id, quantity_lost }] }]

      // Refund capped at what the customer actually paid (minus prior refunds) —
      // cumulative refunds can never exceed tender, even across removals + cancel.
      const paidForCap = order.amountPaid != null ? Number(order.amountPaid) - Number(order.change || 0) : Number(order.totalAmount) || 0;
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

      // Claim first: a concurrent settle loses here instead of double-restoring.
      const claimed = await orderRepository.claimStatus(id, ["pending", "accepted", "preparing"], "cancelled", tx);
      if (claimed === 0) {
        throw new AppError(409, "Order is no longer cancellable — it was settled concurrently", "ORDER_ALREADY_SETTLED");
      }
      // The locked pre-transition status determines stock restoration. Reading
      // after the claim would always return "cancelled" and skip restoration.
      const currentStatus = order.status;

      // Accepted orders: no preparation has started, force no loss
      if (currentStatus === "accepted") {
        lossOption = "no_loss";
      }

      if (currentStatus !== "pending") {
        const losses = lossOption === "with_loss" ? itemLosses : [];
        if (order.consumptionRecordedAt) {
          await this._settleItemConsumption(id, orderItems, deductions, userId, tx, losses);
        } else if (losses.length) {
          throw new AppError(409, "Historical order requires inventory reconciliation before partial cancellation", "CONSUMPTION_HISTORY_REQUIRED");
        } else {
          const historicalItems = await tx.orderItem.findMany({ where: { orderId: id }, select: { removedAt: true } });
          if (historicalItems.some(item => item.removedAt)) throw new AppError(409, "Historical item removals require inventory reconciliation before cancellation", "CONSUMPTION_HISTORY_REQUIRED");
          await this._restoreIngredients(id, userId, tx, deductions);
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
        where: { orderId: id, removedAt: null },
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
      await recordEffects(tx, { audit: {
        userId,
        action: ACTIONS.ORDER_CANCELLED,
        targetType: "order",
        targetId: id,
        details: { order_number: order.orderNumber, reason: reason || null, loss_option: lossOption },
      }, notifications: [{
        type: "order_cancelled",
        title: "Order Cancelled",
        message: `Order ${formatOrderNumber(order.orderNumber)} has been cancelled${reason ? ` (${reason})` : ""}`,
        referenceType: "order",
        referenceId: id,
      }] });
      if (currentStatus !== "pending") await recordSheetEvent(tx, id, "cancelled");
    }, { timeout: 15000 });


    return { order_id: id, action: "cancelled", wasPaid: order.status !== "pending" };
  },

  /* ── Remove Single Item ────────────── */

  async removeOrderItem(orderId, orderItemId, userId, reason, options = {}) {
    let order = await orderRepository.findByIdGuard(orderId);
    if (!order) throw new AppError(404, "Order not found", "ORDER_NOT_FOUND");

    if (order.status !== "accepted" && order.status !== "preparing") {
      throw new AppError(400, "Only accepted or preparing orders can have items removed", "INVALID_STATUS");
    }

    let orderItem = await orderRepository.getOrderItemById(orderItemId);
    if (!orderItem || orderItem.orderId !== orderId) {
      throw new AppError(404, "Order item not found", "ORDER_ITEM_NOT_FOUND");
    }

    if (orderItem.isPrepared) {
      throw new AppError(400, "Cannot remove a prepared item — it has already been served", "ITEM_ALREADY_SERVED");
    }

    let lossOption = options.loss_option || "no_loss";
    const refundOption = options.refund_option || "partial";
    const ingredientLosses = options.ingredient_losses || [];

    // Refund resolved inside the tx after totals are recomputed:
    // refund = net drop caused by the removal, capped at what was actually paid.
    let refundAmount = 0;
    let remainingCount = 0;

    await prisma.$transaction(async (tx) => {
      // Re-check inside the tx: the item may have been marked prepared, or the
      // order settled, between the pre-tx reads and now.
      const locked = await orderRepository.lockOrder(orderId, tx);
      if (!locked) throw new AppError(404, "Order not found", "ORDER_NOT_FOUND");
      order = await orderRepository.findByIdGuard(orderId, tx);
      orderItem = await orderRepository.getOrderItemById(orderItemId, tx);
      if (!orderItem || orderItem.orderId !== orderId || orderItem.removedAt) throw new AppError(404, "Order item not found", "ORDER_ITEM_NOT_FOUND");
      if (orderItem.isPrepared) throw new AppError(400, "Cannot remove a prepared item: it has already been served", "ITEM_ALREADY_SERVED");
      if (!order || !["accepted", "preparing"].includes(order.status)) throw new AppError(409, "Order is no longer editable", "ORDER_ALREADY_SETTLED");
      if (!order.consumptionRecordedAt) throw new AppError(409, "Historical order requires inventory reconciliation before item removal", "CONSUMPTION_HISTORY_REQUIRED");
      if (order.status === "accepted" || ingredientLosses.length === 0) lossOption = "no_loss";
      const deductions = await orderRepository.getActiveDeductions(orderId, tx, orderItemId);
      const losses = lossOption === "with_loss" ? [{ order_item_id: orderItemId, ingredient_losses: ingredientLosses }] : [];
      await this._settleItemConsumption(orderId, [orderItem], deductions, userId, tx, losses);

      // Soft-delete the order item
      await orderRepository.removeOrderItem(orderItemId, { userId, reason, lossOption }, tx);

      // Each stored line carries its paid discount. Removing the discounted
      // line must not transfer that discount to the remaining regular items.
      const remainingItems = await tx.orderItem.findMany({
        where: { orderId, removedAt: null },
        select: { subtotal: true, unitPrice: true, quantity: true, discountType: true, discountPercent: true, discountAmount: true },
      });
      const priced = aggregateLineDiscounts(remainingItems.map(item => ({
        lineSubtotal: roundMoney(Number(item.subtotal ?? Number(item.unitPrice) * item.quantity)),
        discount: { discountType: item.discountType ?? "none", discountPercent: Number(item.discountPercent || 0), discountAmount: Number(item.discountAmount || 0) },
      })));
      const remainingSubtotal = priced.subtotal;
      const oldTotal = roundMoney(Number(order.totalAmount) || 0);
      await orderRepository.updateOrder(orderId, {
        subtotalAmount: remainingSubtotal,
        discountType: priced.discountType,
        discountAmount: priced.discountAmount,
        discountPercent: priced.discountPercent,
        totalAmount: priced.total,
      }, tx);

      // Refund the net drop using locked totals. Cash change is already returned
      // to the customer and cannot increase the cumulative refundable balance.
      const paid = order.amountPaid != null ? Number(order.amountPaid) - Number(order.change || 0) : oldTotal;
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

      remainingCount = remainingItems.length;

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
      await recordEffects(tx, { audit: {
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
      } });
      await recordSheetEvent(tx, orderId, remainingCount === 0 ? "cancelled" : "adjusted", orderItemId);
    }, { timeout: 15000 });


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

    await prisma.$transaction(async tx => {
      const overridden = await orderRepository.overrideLoss(lossId, overrideData, tx);
      await recordEffects(tx, { audit: {
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
      } });
    }, { timeout: 5000 });

    return { lossId, overrideReason };
  },

  /* ── Ingredient Deduction Engine ─────── */

  /** Read recipes once and aggregate demand in thousandths before opening the stock transaction. */
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
        const needed = stockUnits(recipe.quantityNeeded) * item.quantity / 1000;
        needs.set(key, (stockUnits(needs.get(key) || 0) + stockUnits(needed)) / 1000);
      }
    }

    return { needs, recipes };
  },

  /**
   * Reserve stock and record item-level consumption in the caller's transaction.
   * Ingredient locks protect the snapshot; batch versions detect stale writes.
   * Insufficient stock aborts the order, deductions, and audit intent together.
   */
  async _deductIngredients(orderId, needs, tx, userId, recipes) {
    if (needs.size === 0) {
      await tx.order.update({ where: { orderId }, data: { consumptionRecordedAt: new Date() } });
      return { deductions: [], needs };
    }

    // Lock before reading batches so restocks and inventory counts share this snapshot boundary.
    const ingredientIds = [...needs.keys()];
    await lockStock(tx, ingredientIds);
    const allBatches = await orderRepository.getAllAvailableBatches(ingredientIds, tx);

    // Allocate from repository-ordered batches without issuing a query per batch.
    const deductPayloads = [];     // for bulk SQL: { restockId, quantity, version }
    const deductions = [];         // for createMany: deduction records
    const adjustments = [];        // for stock adjustment audit trail

    for (const [ingredientId, totalNeeded] of needs) {
      const batches = allBatches.get(ingredientId) || [];
      const stockBefore = batches.reduce((sum, b) => sum + Number(b.quantityLeft), 0);
      let remaining = stockUnits(totalNeeded);

      for (const batch of batches) {
        if (remaining <= 0) break;
        const available = stockUnits(batch.quantityLeft);
        const toDeduct = Math.min(remaining, available);

        deductPayloads.push({
          restockId: batch.restockId,
          quantity: toDeduct / 1000,
          version: batch.version,
        });

        deductions.push({
          orderId,
          ingredientId,
          restockBatchId: batch.restockId,
          quantityDeducted: toDeduct / 1000,
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

    // Apply the allocation in one write and reject a partial version match.
    const rowsUpdated = await orderRepository.bulkDeductBatches(deductPayloads, tx);
    if (rowsUpdated !== deductPayloads.length) {
      throw new AppError(400, "Insufficient ingredient stock (concurrent modification)", "INSUFFICIENT_STOCK");
    }

    // Persist item attribution and stock audit in batches; the recording marker
    // commits with these writes, including orders with no ingredient recipes.
    if (deductions.length > 0) {
      const items = await orderRepository.getConsumptionItems(orderId, tx);
      await orderRepository.createDeductions(allocateConsumption(items, recipes, deductions), tx);
    }
    if (adjustments.length > 0) {
      await tx.stockAdjustment.createMany({ data: adjustments });
      await this._checkStockLevels(needs, tx, adjustments);
    }

    await tx.order.update({ where: { orderId }, data: { consumptionRecordedAt: new Date() } });
    return { deductions, needs };
  },

  async _checkStockLevels(needs, tx, changes) {
    const info = await orderRepository.getIngredientsBasic([...needs.keys()], tx);
    const notifications = [];
    for (const change of changes) {
      const ing = info.get(change.ingredientId);
      if (!ing) continue;
      const before = change.quantityBefore, after = change.quantityAfter;
      const threshold = Number(ing.minimumThreshold);
      const out = after <= 0 && before > 0;
      const low = after > 0 && after <= threshold && before > threshold;
      if (!out && !low) continue;
      notifications.push({ type: out ? "stock_out" : "stock_low", title: out ? "Out of Stock" : "Low Stock Alert",
        message: out ? `${ing.ingredientName} is now out of stock` : `${ing.ingredientName} is running low — ${after} ${ing.unit} remaining`,
        referenceType: "ingredient", referenceId: change.ingredientId });
    }
    await recordEffects(tx, { notifications });
  },

  /**
   * Restore legacy order-level deductions when item attribution is unavailable.
   * Cancellation must hold the order lock first; ingredient locks then serialize
   * batch credits and the before/after stock ledger in the same transaction.
   */
  async _restoreIngredients(orderId, userId, tx, activeDeductions) {
    const deductions = activeDeductions ?? await orderRepository.getActiveDeductions(orderId, tx);
    await lockStock(tx, deductions.map(row => row.ingredientId));

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

  /**
   * Settle saved item consumption once, restoring only the portion not declared lost.
   * Caller holds the order lock and commits refunds with this stock settlement.
   * Guarded claims reject repeated settlement instead of crediting stock twice.
   */
  async _settleItemConsumption(orderId, items, deductions, userId, tx, itemLosses = []) {
    const { settlements, losses } = planSettlement(items, deductions, itemLosses);
    if (!settlements.length) return;
    await lockStock(tx, settlements.map(row => row.ingredientId));
    // The caller owns the order lock. The guarded batch claim, stock credits,
    // loss records and financial changes all roll back together on failure.
    const claimed = await orderRepository.settleDeductions(orderId, settlements, userId, tx);
    if (claimed !== settlements.length) throw new AppError(409, "Consumption was already settled", "CONSUMPTION_CONFLICT");
    await this._bulkRestoreBatches(settlements.map(row => ({ restockBatchId: row.restockBatchId, qty: row.quantityRestored })), tx);
    if (losses.length) {
      await orderRepository.createOrderItemLosses(losses.map(row => ({
        ...row,
        declaredById: userId,
        lossType: "cancellation",
        relatedOrderId: orderId,
        notes: "Original item consumption: declared loss",
      })), tx);
    }
    const restored = new Map();
    for (const row of settlements) restored.set(row.ingredientId, (stockUnits(restored.get(row.ingredientId) || 0) + stockUnits(row.quantityRestored)) / 1000);
    const ingredientIds = [...restored.keys()].filter(id => restored.get(id) > 0);
    if (userId && ingredientIds.length) {
      const stockMap = await orderRepository.getIngredientsTotalStocks(ingredientIds, tx);
      await tx.stockAdjustment.createMany({
        data: ingredientIds.map(ingredientId => ({
          ingredientId,
          adjustedById: userId,
          adjustmentType: "manual",
          quantityBefore: stockMap.get(ingredientId) - restored.get(ingredientId),
          quantityChanged: restored.get(ingredientId),
          quantityAfter: stockMap.get(ingredientId),
          relatedOrderId: orderId,
          notes: "Original item consumption: stock restored",
        })),
      });
    }
  },

  /* ── Acceptance Handler ──────────────── */

  async _handleAcceptance(id, order, meta, request) {
    if (!meta.amountPaid) {
      throw new AppError(400, "Amount paid is required for acceptance", "PAYMENT_REQUIRED");
    }

    // Re-price from live variant prices so acceptance can't use stale totals.
    // Per-item mode: item_discounts (from the accept-payment modal, keyed by
    // order_item_id) attach a single discount to each stored line. Legacy
    // mode: whole-bill meta.discount_type applies to the subtotal.
    const patchByItemId = new Map(
      (meta.item_discounts ?? []).map((d) => [Number(d.order_item_id), d]),
    );
    const activeItemIds = new Set(order.items.map(item => item.orderItemId));
    if (patchByItemId.size !== (meta.item_discounts ?? []).length || [...patchByItemId.keys()].some(id => !activeItemIds.has(id))) {
      throw new AppError(400, "Discounts must reference distinct active items in this order", "INVALID_ITEM_DISCOUNT");
    }
    const orderItems = order.items.map((item) => {
      const patch = patchByItemId.get(Number(item.orderItemId ?? item.order_item_id));
      return {
        order_item_id: item.orderItemId,
        product_id: item.productId,
        variant_id: item.variantId,
        quantity: item.quantity,
        unit_price: Number(item.unitPrice),
        discount_type: patch?.discount_type ?? item.discountType ?? item.discount_type ?? "none",
        promo_mode: patch?.promo_mode,
        promo_value: patch?.promo_value,
        discount_label: patch?.discount_label ?? item.discountLabel ?? item.discount_label ?? undefined,
      };
    });
    const discountInput = {
      discount_type: meta.discount_type,
      promo_mode: meta.promo_mode,
      promo_value: meta.promo_value,
      senior_id_no: meta.senior_id_no,
      pwd_id_no: meta.pwd_id_no,
      discount_id_no: meta.discount_id_no,
      discount_label: meta.discount_label,
    };
    const { subtotal, discount: discountResult, total, pricedItems } =
      await this._priceItemsAndTotals(orderItems, discountInput);
    const identity = this._resolveDiscountIdentity(
      { ...discountInput, discount_label: discountInput.discount_label ?? undefined },
      pricedItems,
      discountResult.discountType,
    );

    await this._assertPaymentValid({ amountPaid: meta.amountPaid, total, paymentMethod: meta.payment_method });

    const paymentMethod = meta.payment_method ?? order.paymentMethod ?? "cash";
    const change = paymentMethod === "cash" ? roundMoney(meta.amountPaid - total) : 0;
    const paidToStore = paymentMethod === "cash" ? meta.amountPaid : total;

    // Batch recipe lookup (1 query instead of N per-item queries)
    const { needs: ingredientNeeds, recipes: consumptionRecipes } = await this._aggregateIngredientNeeds(orderItems);

    let transactionNeeds;

    const outcome = await prisma.$transaction(async (tx) => {
      const replay = await orderIdempotency.claim(request, tx);
      if (replay) return replay;
      const { shiftId } = await shiftService.resolveShiftForUser(meta.userId, tx);
      // Claim first: a concurrent accept loses here instead of double-deducting.
      const claimed = await orderRepository.claimStatus(id, "pending", "accepted", tx);
      if (claimed === 0) {
        throw new AppError(409, "Order is no longer pending — it was settled concurrently", "ORDER_ALREADY_SETTLED");
      }

      const currentItems = await orderRepository.getOrderItems(id, tx);
      const signature = lines => JSON.stringify(lines.map(item => [item.orderItemId, item.variantId, item.quantity, Number(item.unitPrice)]).sort((a, b) => a[0] - b[0]));
      if (signature(currentItems) !== signature(order.items)) {
        throw new AppError(409, "Order items changed. Refresh before accepting payment", "ORDER_STATE_CONFLICT");
      }
      const updated = await orderRepository.updatePricedItems(id, pricedItems, tx);
      if (updated !== pricedItems.length) throw new AppError(409, "Order items changed during acceptance", "ORDER_STATE_CONFLICT");

      const { needs } = await this._deductIngredients(id, ingredientNeeds, tx, meta.userId, consumptionRecipes);
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
        discountLabel: identity.discountLabel,
        discountIdNo: identity.discountIdNo,
        seniorIdNo: identity.seniorIdNo,
        pwdIdNo: identity.pwdIdNo,
        discountAmount: discountResult.discountAmount,
        discountBy: discountResult.discountType === "none" ? null : meta.userId,
        paymentMethod,
        referenceNo: meta.reference_no ?? null,
        shiftId,
        totalAmount: total,
        amountPaid: paidToStore,
        change,
      }, tx);
      await recordSheetEvent(tx, id, "paid");
      await recordEffects(tx, { audit: {
        userId: meta.userId,
        action: ACTIONS.ORDER_ACCEPTED,
        targetType: "order",
        targetId: id,
        details: { order_number: order.orderNumber, total, source: order.orderSource },
      }, notifications: [{
        type: "order_accepted",
        title: "Order Accepted",
        message: `Order ${formatOrderNumber(order.orderNumber)} has been accepted`,
        referenceType: "order",
        referenceId: id,
      }] });
      return orderIdempotency.complete(request, { order_id: id, order_number: order.orderNumber }, tx);
    }, { timeout: 15000 });

    if (!transactionNeeds) return { response: outcome, replayed: true };

    return { response: outcome, replayed: false };
  },
};
