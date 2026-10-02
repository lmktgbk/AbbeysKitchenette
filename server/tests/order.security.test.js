import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from "vitest";
import express from "express";
import { createOrderDatabase } from "./helpers/orderDatabase.js";

const h = vi.hoisted(() => ({ db: null, role: "cashier" }));
vi.mock("../src/config/prisma.js", () => ({ default: new Proxy({}, { get: (_target, key) => h.db[key] }) }));
vi.mock("../src/config/env.js", () => ({ env: { NODE_ENV: "test" } }));
vi.mock("../src/middleware/authenticate.middleware.js", () => ({ default: (req, _res, next) => {
  req.user = { id: "123e4567-e89b-42d3-a456-426614174000", role: h.role };
  next();
} }));
vi.mock("../src/modules/auditLogs/auditLog.service.js", () => ({ auditLogService: { logAction: vi.fn().mockResolvedValue({}) } }));
vi.mock("../src/modules/notifications/notification.service.js", () => ({ notificationService: { create: vi.fn().mockResolvedValue({}) } }));
vi.mock("../src/modules/products/product.service.js", () => ({ productService: { recomputeVariantAvailability: vi.fn().mockResolvedValue({}) } }));
vi.mock("../src/modules/settings/settings.service.js", () => ({ settingsService: { getAcceptedPayments: vi.fn().mockResolvedValue(["cash", "gcash", "maya"]) } }));
vi.mock("../src/modules/anomalyDetection/anomalyDetection.service.js", () => ({ anomalyService: { runScan: vi.fn().mockResolvedValue({}) } }));
vi.mock("../src/modules/sheets/sheets.service.js", () => ({ sheetsService: { enqueue: vi.fn() } }));
vi.mock("../src/realtime/events.js", () => ({ emitOrderChanged: vi.fn(), emitStockChanged: vi.fn(), emitGuestForOrder: vi.fn() }));

import router from "../src/modules/orders/order.routes.js";
import errorHandler from "../src/middleware/errorHandler.middleware.js";
import { orderService } from "../src/modules/orders/order.service.js";
import { orderRepository } from "../src/modules/orders/order.repository.js";
import { shiftService } from "../src/modules/shifts/shift.service.js";
import { shiftRepository } from "../src/modules/shifts/shift.repository.js";
import { orderIdempotency, orderRequest } from "../src/modules/orders/order.idempotency.js";

const A = "123e4567-e89b-42d3-a456-426614174001";
const B = "123e4567-e89b-42d3-a456-426614174002";
const USER = "123e4567-e89b-42d3-a456-426614174000";
const KEY = "123e4567-e89b-42d3-a456-426614174003";
let server, base;
beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/orders", router);
  app.use(errorHandler);
  server = await new Promise(resolve => { const listener = app.listen(0, "127.0.0.1", () => resolve(listener)); });
  base = `http://127.0.0.1:${server.address().port}/orders`;
});
afterAll(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  h.role = "cashier";
  h.db = createOrderDatabase();
  h.db.reset([A, B].map(orderId => ({ orderId, orderNumber: 1, status: "accepted", totalAmount: 100, amountPaid: 0, createdAt: new Date() })),
    [{ orderItemId: 1, orderId: A, removedAt: null, isPrepared: false }, { orderItemId: 2, orderId: B, removedAt: null, isPrepared: false }]);
  vi.spyOn(orderService, "getById").mockImplementation(id => h.db.order.findUnique({ where: { orderId: id } }));
  vi.spyOn(orderService, "_restoreIngredients").mockImplementation(async () => { h.db.state.restores++; });
});
const request = (path, method, body) => fetch(base + path, { method, headers: { "Content-Type": "application/json", "Idempotency-Key": KEY }, body: body === undefined ? undefined : JSON.stringify(body) });

describe("Order permissions and transaction boundaries", () => {
  it.each(["admin", "cashier", "kitchen"])("%s can start preparation through the API", async role => {
    h.role = role;
    expect((await request(`/${A}/prepare`, "POST")).status).toBe(200);
    expect(h.db.state.orders[0]).toMatchObject({ status: "preparing", preparingBy: USER });
  });
  it("kitchen cannot accept payment even when the payload claims an admin role", async () => {
    h.role = "kitchen";
    const acceptance = vi.spyOn(orderService, "_handleAcceptance");
    expect((await request(`/${A}/status`, "PUT", { status: "accepted", amount_paid: 100, userRole: "admin" })).status).toBe(403);
    expect(acceptance).not.toHaveBeenCalled();
  });
  it.each(["admin", "cashier"])("%s reaches the authorized acceptance workflow", async role => {
    h.role = role;
    h.db.state.orders[0].status = "pending";
    const acceptance = vi.spyOn(orderService, "_handleAcceptance").mockResolvedValue({ response: { order_id: A }, replayed: false });
    expect((await request(`/${A}/status`, "PUT", { status: "accepted", amount_paid: 100 })).status).toBe(200);
    expect(acceptance).toHaveBeenCalledWith(A, expect.any(Object), expect.objectContaining({ userRole: role, userId: USER }), expect.any(Object));
  });
  it("service authorization fails closed without a trusted role", async () => {
    await expect(orderService.advanceStatus(A, "accepted", { userId: USER })).rejects.toMatchObject({ statusCode: 403 });
  });
  it("generic status action cannot bypass cancellation bookkeeping", async () => {
    await expect(orderService.advanceStatus(A, "cancelled", { userId: USER, userRole: "admin" })).rejects.toMatchObject({ statusCode: 400 });
    expect(h.db.state.orders[0].status).toBe("accepted");
  });
  it("alternate status endpoint uses the same guarded preparation workflow", async () => {
    h.role = "kitchen";
    expect((await request(`/${A}/status`, "PUT", { status: "preparing" })).status).toBe(200);
    expect(h.db.state.orders[0].preparingBy).toBe(USER);
  });
  it("another order's item cannot be checked", async () => {
    expect((await request(`/${A}/items/2`, "PATCH", { is_prepared: true })).status).toBe(404);
    expect(h.db.state.items[1].isPrepared).toBe(false);
  });
  it("removed items cannot be checked", async () => {
    h.db.state.items[0].removedAt = new Date();
    expect((await request(`/${A}/items/1`, "PATCH", { is_prepared: true })).status).toBe(404);
    expect(h.db.state.items[0].isPrepared).toBe(false);
  });
  it("active item can be checked and unchecked", async () => {
    expect((await request(`/${A}/items/1`, "PATCH", { is_prepared: true })).status).toBe(200);
    expect(h.db.state.items[0]).toMatchObject({ isPrepared: true, preparedBy: USER });
    expect((await request(`/${A}/items/1`, "PATCH", { is_prepared: false })).status).toBe(200);
    expect(h.db.state.items[0]).toMatchObject({ isPrepared: false, preparedBy: null, preparedAt: null });
  });
  it.each(["cancelled", "completed", "pending"])("%s order rejects item changes and preparation", async status => {
    h.db.state.orders[0].status = status;
    expect((await request(`/${A}/items/1`, "PATCH", { is_prepared: true })).status).toBe(409);
    expect((await request(`/${A}/prepare`, "POST")).status).toBe(409);
    expect(h.db.state.orders[0].status).toBe(status);
  });
  it("missing order returns 404", async () => {
    h.db.state.orders = [];
    expect((await request(`/${A}/prepare`, "POST")).status).toBe(404);
    expect((await request(`/${A}/items/1`, "PATCH", { is_prepared: true })).status).toBe(404);
  });
  it.each([
    [{ removedAt: new Date() }, 404],
    [{ isPrepared: true }, 400],
  ])("removal rechecks the item after acquiring the parent lock (%j)", async (change, statusCode) => {
    vi.spyOn(orderRepository, "getOrderItemById").mockResolvedValue({ orderItemId: 1, orderId: A, isPrepared: false, variantId: 1 });
    vi.spyOn(orderRepository, "getRecipesByVariantIds").mockResolvedValue([]);
    vi.spyOn(h.db.orderItem, "findUnique").mockResolvedValue({ orderId: A, isPrepared: false, removedAt: null, ...change });
    const lock = vi.spyOn(orderRepository, "lockOrder");
    await expect(orderService.removeOrderItem(A, 1, USER)).rejects.toMatchObject({ statusCode });
    expect(lock).toHaveBeenCalledWith(A, h.db);
    expect(h.db.state.restores).toBe(0);
  });
  it("parallel preparation requests have one winner", async () => {
    const outcomes = await Promise.allSettled([orderService.prepareOrder(A, USER), orderService.prepareOrder(A, USER)]);
    expect(outcomes.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.find(result => result.status === "rejected").reason.statusCode).toBe(409);
    expect(h.db.state.orders[0].status).toBe("preparing");
  });
  it("failed preparation write preserves the accepted status", async () => {
    vi.spyOn(orderRepository, "updateStatus").mockRejectedValue(new Error("Injected update failure"));
    await expect(orderService.prepareOrder(A, USER)).rejects.toThrow("Injected update failure");
    expect(h.db.state.orders[0].status).toBe("accepted");
  });
  it.each([true, false])("cancellation/preparation scheduling leaves the order cancelled (cancel first: %s)", async cancelFirst => {
    const cancel = () => orderService.cancelOrDelete(A, USER);
    const prepare = () => orderService.prepareOrder(A, USER);
    const outcomes = await Promise.allSettled(cancelFirst ? [cancel(), prepare()] : [prepare(), cancel()]);
    expect(outcomes[cancelFirst ? 0 : 1].status).toBe("fulfilled");
    expect(h.db.state.orders[0].status).toBe("cancelled");
    expect(h.db.state.cancellations).toHaveLength(1);
    expect(h.db.state.restores).toBe(1);
  });
  it("cancellation between the initial read and preparation claim stays cancelled", async () => {
    const read = orderRepository.findByIdGuard.bind(orderRepository);
    vi.spyOn(orderRepository, "findByIdGuard").mockImplementation(async (...args) => {
      const order = await read(...args);
      h.db.state.orders[0].status = "cancelled";
      return order;
    });
    await expect(orderService.prepareOrder(A, USER)).rejects.toMatchObject({ statusCode: 409 });
    expect(h.db.state.orders[0].status).toBe("cancelled");
  });
  it("completion requires every active item prepared", async () => {
    h.db.state.orders[0].status = "preparing";
    expect((await request(`/${A}/status`, "PUT", { status: "completed" })).status).toBe(400);
    expect(h.db.state.orders[0].status).toBe("preparing");
    h.db.state.items[0].isPrepared = true;
    expect((await request(`/${A}/status`, "PUT", { status: "completed" })).status).toBe(200);
    expect((await request(`/${A}/items/1`, "PATCH", { is_prepared: false })).status).toBe(409);
    expect(h.db.state.items[0].isPrepared).toBe(true);
  });
  it("completion rechecks status under the order lock", async () => {
    h.db.state.orders[0].status = "preparing";
    h.db.state.items[0].isPrepared = true;
    vi.spyOn(orderRepository, "lockOrder").mockResolvedValue({ status: "cancelled" });
    await expect(orderService.advanceStatus(A, "completed", { userId: USER, userRole: "kitchen" })).rejects.toMatchObject({ statusCode: 409 });
    expect(h.db.state.orders[0].status).toBe("preparing");
  });
  it.each([true, false])("completion cannot leave an unprepared completed item (complete first: %s)", async completeFirst => {
    h.db.state.orders[0].status = "preparing";
    h.db.state.items[0].isPrepared = true;
    const complete = () => orderService.advanceStatus(A, "completed", { userId: USER, userRole: "kitchen" });
    const uncheck = () => orderService.checkOrderItem(A, 1, false, USER);
    await Promise.allSettled(completeFirst ? [complete(), uncheck()] : [uncheck(), complete()]);
    expect(h.db.state.orders[0].status !== "completed" || h.db.state.items[0].isPrepared).toBe(true);
  });
  it.each(["accepted", "preparing"])("cancelling %s restores stock based on pre-transition status", async status => {
    h.db.state.orders[0].status = status;
    await orderService.cancelOrDelete(A, USER, "Test", { loss_option: "no_loss" });
    expect(h.db.state.orders[0].status).toBe("cancelled");
    expect(h.db.state.restores).toBe(1);
    expect(h.db.state.cancellations).toHaveLength(1);
  });
  it("parallel cancellation records and restores only once", async () => {
    const outcomes = await Promise.allSettled([orderService.cancelOrDelete(A, USER), orderService.cancelOrDelete(A, USER)]);
    expect(outcomes.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(h.db.state.cancellations).toHaveLength(1);
    expect(h.db.state.restores).toBe(1);
  });
  it("pending cancellation does not restore inventory or record a refund", async () => {
    h.db.state.orders[0].status = "pending";
    await orderService.cancelOrDelete(A, USER);
    expect(h.db.state.restores).toBe(0);
    expect(h.db.state.refunds).toHaveLength(0);
  });
  it("paid cancellation records one capped refund", async () => {
    h.db.state.orders[0].amountPaid = 100;
    h.db.state.orders[0].refund = { amount: 30 };
    await orderService.cancelOrDelete(A, USER, "Test", { refund_option: "full" });
    expect(h.db.state.refunds).toHaveLength(1);
    expect(h.db.state.refunds[0].amount).toBe(70);
    await expect(orderService.cancelOrDelete(A, USER)).rejects.toMatchObject({ statusCode: 409 });
    expect(h.db.state.refunds).toHaveLength(1);
  });
  it.each([false, true])("full cancellation restores recorded batch quantities atomically (write fails: %s)", async failWrite => {
    orderService._restoreIngredients.mockRestore();
    h.db.state.batchQuantity = 6;
    h.db.state.batchVersion = 0;
    h.db.state.reversed = false;
    h.db.state.adjustments = [];
    h.db.failCancellation = failWrite;
    const ingredientId = B;
    vi.spyOn(orderRepository, "getActiveDeductions").mockImplementation(async () => h.db.state.reversed ? [] :
      [{ ingredientId, restockBatchId: 7, quantityDeducted: 4, batch: { costPerUnit: 2 } }]);
    h.db.restockBatch = { findMany: async () => [{ restockId: 7, version: h.db.state.batchVersion }] };
    h.db.stockAdjustment = { createMany: async ({ data }) => { h.db.state.adjustments.push(...data); } };
    vi.spyOn(orderRepository, "bulkRestoreBatches").mockImplementation(async rows => {
      expect(rows).toEqual([{ restockId: 7, quantity: 4, version: 0 }]);
      h.db.state.batchQuantity += rows[0].quantity;
      h.db.state.batchVersion++;
      return 1;
    });
    vi.spyOn(orderRepository, "reverseDeductions").mockImplementation(async () => { h.db.state.reversed = true; });
    vi.spyOn(orderRepository, "getIngredientsTotalStocks").mockImplementation(async () => new Map([[ingredientId, h.db.state.batchQuantity]]));
    if (failWrite) {
      await expect(orderService.cancelOrDelete(A, USER)).rejects.toThrow("Injected cancellation failure");
      expect(h.db.state.batchQuantity).toBe(6);
      expect(h.db.state.reversed).toBe(false);
      expect(h.db.state.adjustments).toHaveLength(0);
    } else {
      await orderService.cancelOrDelete(A, USER);
      expect(h.db.state.batchQuantity).toBe(10);
      expect(h.db.state.reversed).toBe(true);
      expect(h.db.state.adjustments).toEqual([expect.objectContaining({ quantityBefore: 6, quantityChanged: 4, quantityAfter: 10 })]);
    }
  });
  it("failed cancellation rolls back status and restoration", async () => {
    h.db.failCancellation = true;
    await expect(orderService.cancelOrDelete(A, USER)).rejects.toThrow("Injected cancellation failure");
    expect(h.db.state.orders[0].status).toBe("accepted");
    expect(h.db.state.restores).toBe(0);
    expect(h.db.state.cancellations).toHaveLength(0);
  });
});

describe("Financial transactions, request replay and shift closure", () => {
  const accept = (extra = {}) => orderService.advanceStatus(A, "accepted", { userId: USER, userRole: "cashier", amountPaid: 200, idempotencyKey: KEY, ...extra });
  const walkIn = (extra = {}) => orderService.createWalkIn({ customerName: "Fixture", tableNumber: "1", items: [{ product_id: B, variant_id: 1, quantity: 1, unit_price: 100 }], amountPaid: 100, createdBy: USER, idempotencyKey: KEY, ...extra });
  beforeEach(() => {
    h.db.state.orders[0].status = "pending";
    Object.assign(h.db.state.items[0], { productId: B, variantId: 1, quantity: 1, unitPrice: 100, discountType: "none" });
    h.db.state.shifts.push({ shiftId: B, openedBy: USER, status: "open", openingCash: 0, openedAt: new Date() });
    vi.spyOn(orderRepository, "getVariantPrices").mockResolvedValue(new Map([[1, 100]]));
    vi.spyOn(orderService, "_assertPaymentValid").mockResolvedValue();
    vi.spyOn(orderService, "_aggregateIngredientNeeds").mockResolvedValue(new Map());
    vi.spyOn(orderService, "_deductIngredients").mockImplementation(async id => {
      h.db.state.deductions.push({ orderId: id });
      return { deductions: [], needs: new Map() };
    });
    vi.spyOn(orderService, "_checkStockLevels").mockResolvedValue();
    vi.spyOn(shiftRepository, "getShiftOpenOrders").mockImplementation(async () => ({ openCount: h.db.state.orders.filter(row => row.shiftId === B && ["accepted", "preparing"].includes(row.status)).length }));
    vi.spyOn(shiftService, "buildSummary").mockImplementation(async () => ({ expected_cash: h.db.state.orders.filter(row => row.shiftId === B).reduce((sum, row) => sum + Number(row.totalAmount || 0), 0) }));
  });
  it("missing/invalid keys are rejected before any business write", async () => {
    await expect(walkIn({ idempotencyKey: undefined })).rejects.toMatchObject({ statusCode: 400 });
    await expect(walkIn({ idempotencyKey: "invalid" })).rejects.toMatchObject({ statusCode: 400 });
    expect(h.db.state.requests).toHaveLength(0);
    expect(h.db.state.receipts).toHaveLength(0);
  });
  it("concurrent walk-in replay creates one sale, receipt and deduction set", async () => {
    const results = await Promise.all([walkIn(), walkIn()]);
    expect(results[0]).toEqual(results[1]);
    expect(h.db.state.receipts).toHaveLength(1);
    expect(h.db.state.deductions).toHaveLength(1);
    expect(h.db.state.requests).toHaveLength(1);
    expect(h.db.state.orders).toHaveLength(3);
  });
  it("retry after a lost response does not require an open shift or fresh prices", async () => {
    const original = await walkIn();
    h.db.state.shifts[0].status = "closed";
    orderRepository.getVariantPrices.mockRejectedValue(new Error("Prices unavailable"));
    expect(await walkIn()).toEqual(original);
    expect(h.db.state.receipts).toHaveLength(1);
  });
  it("same key with changed details conflicts; a new key permits an intentional sale", async () => {
    await walkIn();
    await expect(walkIn({ customerName: "Other" })).rejects.toMatchObject({ statusCode: 409, code: "IDEMPOTENCY_CONFLICT" });
    await walkIn({ idempotencyKey: A });
    expect(h.db.state.receipts).toHaveLength(2);
  });
  it("request keys are scoped to the authenticated operator", async () => {
    await walkIn();
    h.db.state.shifts.push({ shiftId: A, openedBy: B, status: "open" });
    await walkIn({ createdBy: B });
    expect(h.db.state.requests).toHaveLength(2);
  });
  it.each(["failReceipt", "failRequestResult"])("%s rolls back the order, receipt, deductions and key", async failure => {
    h.db[failure] = true;
    await expect(walkIn()).rejects.toThrow();
    expect(h.db.state.orders).toHaveLength(2);
    expect(h.db.state.requests).toHaveLength(0);
    expect(h.db.state.receipts).toHaveLength(0);
    expect(h.db.state.deductions).toHaveLength(0);
    h.db[failure] = false;
    await walkIn();
    expect(h.db.state.receipts).toHaveLength(1);
  });
  it("identical product lines keep their individual discounts and update in one query", async () => {
    h.db.state.items.push({ ...h.db.state.items[0], orderItemId: 3 });
    const batch = vi.spyOn(h.db, "$executeRaw");
    const result = await accept({ item_discounts: [
      { order_item_id: 1, discount_type: "promo", promo_mode: "percent", promo_value: 10 },
      { order_item_id: 3, discount_type: "promo", promo_mode: "percent", promo_value: 20 },
    ] });
    expect(result.order_id).toBe(A);
    expect(h.db.state.items.find(row => row.orderItemId === 1).discountAmount).toBe(10);
    expect(h.db.state.items.find(row => row.orderItemId === 3).discountAmount).toBe(20);
    expect(h.db.state.orders[0].totalAmount).toBe(170);
    expect(batch).toHaveBeenCalledTimes(1);
    expect(h.db.state.receipts[0].totalAmount).toBe(170);
  });
  it.each([
    [{ order_item_id: 999, discount_type: "none" }],
    [{ order_item_id: 1, discount_type: "none" }, { order_item_id: 1, discount_type: "none" }],
  ].map(item_discounts => ({ item_discounts })))("invalid discount line references are rejected before settlement (%j)", async ({ item_discounts }) => {
    await expect(accept({ item_discounts })).rejects.toMatchObject({ code: "INVALID_ITEM_DISCOUNT" });
    expect(h.db.state.orders[0].status).toBe("pending");
    expect(h.db.state.receipts).toHaveLength(0);
  });
  it("insufficient cash is rejected before claiming a request key", async () => {
    orderService._assertPaymentValid.mockRestore();
    await expect(walkIn({ amountPaid: 99 })).rejects.toMatchObject({ code: "INSUFFICIENT_PAYMENT" });
    expect(h.db.state.requests).toHaveLength(0);
    expect(h.db.state.deductions).toHaveLength(0);
  });
  it.each(["gcash", "maya"])("%s remains a manual record with zero cash change", async payment_method => {
    orderService._assertPaymentValid.mockRestore();
    const result = await walkIn({ payment: { payment_method, reference_no: "TEST-REFERENCE" } });
    const sale = h.db.state.orders.find(row => row.orderId === result.order_id);
    expect(sale).toMatchObject({ paymentMethod: payment_method, referenceNo: "TEST-REFERENCE", totalAmount: 100, amountPaid: 100, change: 0 });
    expect(h.db.state.receipts).toHaveLength(1);
  });
  it.each(["failLine", "failReceipt", "failRequestResult"])("acceptance %s preserves pending state and rolls back priced lines", async failure => {
    h.db[failure] = true;
    await expect(accept({ item_discounts: [{ order_item_id: 1, discount_type: "promo", promo_mode: "percent", promo_value: 20 }] })).rejects.toThrow();
    expect(h.db.state.orders[0].status).toBe("pending");
    expect(h.db.state.items[0].discountType).toBe("none");
    expect(h.db.state.receipts).toHaveLength(0);
    expect(h.db.state.deductions).toHaveLength(0);
    expect(h.db.state.requests).toHaveLength(0);
  });
  it("concurrent acceptance with the same key returns the same committed result", async () => {
    const results = await Promise.all([accept(), accept()]);
    expect(results[0]).toEqual(results[1]);
    expect(h.db.state.receipts).toHaveLength(1);
    expect(h.db.state.deductions).toHaveLength(1);
    expect(h.db.state.orders[0].status).toBe("accepted");
  });
  it("acceptance refuses an order changed during pricing", async () => {
    const price = orderService._priceItemsAndTotals.bind(orderService);
    vi.spyOn(orderService, "_priceItemsAndTotals").mockImplementation(async (...args) => {
      const result = await price(...args);
      h.db.state.items[0].quantity = 2;
      return result;
    });
    await expect(accept()).rejects.toMatchObject({ statusCode: 409 });
    expect(h.db.state.orders[0].status).toBe("pending");
    expect(h.db.state.receipts).toHaveLength(0);
  });
  it("closed shift rejects payment without leaving a claimed key", async () => {
    h.db.state.shifts[0].status = "closed";
    await expect(walkIn()).rejects.toMatchObject({ statusCode: 409, code: "SHIFT_REQUIRED" });
    expect(h.db.state.requests).toHaveLength(0);
    expect(h.db.state.deductions).toHaveLength(0);
  });
  it.each([true, false])("sale/forced-close scheduling preserves the closing snapshot (sale first: %s)", async saleFirst => {
    const close = () => shiftService.closeShift({ id: B, actualCash: 0, closeNote: "Fixture", userId: USER, forced: true });
    const outcomes = await Promise.allSettled(saleFirst ? [walkIn(), close()] : [close(), walkIn()]);
    const paid = h.db.state.receipts.length;
    const shift = h.db.state.shifts[0];
    expect(shift.status).toBe("closed");
    expect(shift.expectedCash).toBe(paid * 100);
    expect(h.db.state.deductions).toHaveLength(paid);
    expect(outcomes.some(result => result.status === "fulfilled")).toBe(true);
    await expect(walkIn({ idempotencyKey: A })).rejects.toMatchObject({ code: "SHIFT_REQUIRED" });
  });
  it("normal closure refuses accepted orders without closing the shift", async () => {
    await walkIn();
    await expect(shiftService.closeShift({ id: B, actualCash: 100, userId: USER })).rejects.toMatchObject({ code: "OPEN_ORDERS_PENDING" });
    expect(h.db.state.shifts[0].status).toBe("open");
  });
  it("guest replay keeps the tracking token and bypasses closed-store checks", async () => {
    const input = { customerName: "Guest", tableNumber: "1", items: [{ product_id: B, variant_id: 1, quantity: 1, unit_price: 100 }], guestToken: A, idempotencyKey: KEY };
    const original = await orderService.createOnline(input);
    const beforeCreate = vi.fn().mockRejectedValue(new Error("Store closed"));
    const replay = await orderService.createOnline({ ...input, guestToken: B, beforeCreate });
    expect(replay).toEqual(original);
    expect(replay.guest_token).toBe(A);
    expect(beforeCreate).not.toHaveBeenCalled();
    expect(h.db.state.orders).toHaveLength(3);
  });
  it("fulfillment replay cannot replace items or deduct stock twice", async () => {
    const input = { id: A, items: [{ product_id: B, variant_id: 1, quantity: 1, unit_price: 100 }], amountPaid: 100, userId: USER, idempotencyKey: KEY };
    const results = await Promise.all([orderService.fulfillPendingOrder(input), orderService.fulfillPendingOrder(input)]);
    expect(results[0]).toEqual(results[1]);
    expect(h.db.state.receipts).toHaveLength(1);
    expect(h.db.state.deductions).toHaveLength(1);
  });
  it("canonical payload ordering produces the same digest", () => {
    expect(orderRequest("test", KEY, { a: 1, b: 2 }).requestHash).toBe(orderRequest("test", KEY, { b: 2, a: 1 }).requestHash);
  });
  it("incomplete committed keys are rejected instead of executing another sale", async () => {
    const key = orderRequest("test", KEY, {});
    await h.db.orderRequest.createMany({ data: key });
    await expect(orderIdempotency.lookup(key)).rejects.toMatchObject({ statusCode: 409, code: "SUBMISSION_PENDING" });
  });
});
