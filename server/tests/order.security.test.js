import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from "vitest";
import express from "express";
import { createOrderDatabase } from "./helpers/orderDatabase.js";

const h = vi.hoisted(() => ({ db: null, role: "cashier", sheets: false }));
vi.mock("../src/config/prisma.js", () => ({ default: new Proxy({}, { get: (_target, key) => h.db[key] }) }));
vi.mock("../src/config/env.js", () => ({ env: { NODE_ENV: "test",
  get GOOGLE_SERVICE_ACCOUNT_EMAIL() { return h.sheets ? "fixture@example.invalid" : undefined; },
  get GOOGLE_PRIVATE_KEY() { return h.sheets ? "fixture-not-a-real-key" : undefined; },
  get SHEETS_ORDERS_ID() { return h.sheets ? "fixture-spreadsheet" : undefined; },
} }));
vi.mock("../src/middleware/authenticate.middleware.js", () => ({ default: (req, _res, next) => {
  req.user = { id: "123e4567-e89b-42d3-a456-426614174000", role: h.role };
  next();
} }));
vi.mock("../src/modules/auditLogs/auditLog.service.js", () => ({ auditLogService: { logAction: vi.fn().mockResolvedValue({}) } }));
vi.mock("../src/modules/notifications/notification.service.js", () => ({ notificationService: { create: vi.fn().mockResolvedValue({}) } }));
vi.mock("../src/modules/products/product.service.js", () => ({ productService: { recomputeVariantAvailability: vi.fn().mockResolvedValue({}) } }));
vi.mock("../src/modules/settings/settings.service.js", () => ({ settingsService: { getAcceptedPayments: vi.fn().mockResolvedValue(["cash", "gcash", "maya"]) } }));
vi.mock("../src/modules/anomalyDetection/anomalyDetection.service.js", () => ({ anomalyService: { runScan: vi.fn().mockResolvedValue({}) } }));
vi.mock("../src/infrastructure/realtime/events.js", () => ({ emitOrderChanged: vi.fn(), emitStockChanged: vi.fn(), emitGuestForOrder: vi.fn() }));

import router from "../src/modules/orders/order.routes.js";
import errorHandler from "../src/middleware/errorHandler.middleware.js";
import { orderService } from "../src/modules/orders/order.service.js";
import { orderRepository } from "../src/modules/orders/order.repository.js";
import { shiftService } from "../src/modules/shifts/shift.service.js";
import { shiftRepository } from "../src/modules/shifts/shift.repository.js";
import { allocateConsumption, planSettlement, stockUnits } from "../src/modules/orders/order.consumption.js";
import { allocateBillDiscount } from "../src/modules/orders/order.pricing.js";
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
  h.sheets = false;
  h.db = createOrderDatabase();
  h.db.reset([A, B].map(orderId => ({ orderId, orderNumber: 1, status: "accepted", totalAmount: 100, amountPaid: 0, createdAt: new Date() })),
    [{ orderItemId: 1, orderId: A, removedAt: null, isPrepared: false }, { orderItemId: 2, orderId: B, removedAt: null, isPrepared: false }]);
  vi.spyOn(orderService, "getById").mockImplementation(id => h.db.order.findUnique({ where: { orderId: id } }));
  vi.spyOn(orderService, "_restoreIngredients").mockImplementation(async () => { h.db.state.restores++; });
});
const request = (path, method, body) => fetch(base + path, { method, headers: { "Content-Type": "application/json", "Idempotency-Key": KEY }, body: body === undefined ? undefined : JSON.stringify(body) });

describe("Order permissions and transaction boundaries", () => {
  it("completion captures financial metadata from the locked order", async () => {
    h.db.state.orders[0].status = "preparing"; h.db.state.items[0].isPrepared = true;
    const lock = orderRepository.lockOrder.bind(orderRepository);
    vi.spyOn(orderRepository, "lockOrder").mockImplementation(async (id, tx) => {
      h.db.state.orders[0].totalAmount = 80;
      return lock(id, tx);
    });
    await orderService.advanceStatus(A, "completed", { userId: USER, userRole: "kitchen" });
    expect(h.db.state.effects[0].payload.audit.details.total).toBe(80);
    expect(h.db.state.effects[0].payload.notifications[0].message).toContain("80.00");
  });
  it("rejects a bill exceeding storage capacity using authoritative prices", async () => {
    vi.spyOn(orderRepository, "getVariantPrices").mockResolvedValue(new Map([[1, 99999999.99]]));
    await expect(orderService._priceItemsAndTotals([
      { variant_id: 1, unit_price: 99999999.99, quantity: 2 },
    ])).rejects.toMatchObject({ statusCode: 400, code: "AMOUNT_OUT_OF_RANGE" });
  });
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
    vi.spyOn(orderRepository, "getOrderItemById")
      .mockResolvedValueOnce({ orderItemId: 1, orderId: A, isPrepared: false, variantId: 1 })
      .mockResolvedValue({ orderItemId: 1, orderId: A, isPrepared: false, removedAt: null, ...change });
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
    vi.spyOn(orderService, "_aggregateIngredientNeeds").mockResolvedValue({ needs: new Map(), recipes: [] });
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
    expect(h.db.state.effects).toHaveLength(1);
    expect(h.db.state.effects[0].payload).toMatchObject({ audit: { action: "ORDER_CREATED" }, notifications: [{ type: "order_new" }] });
  });
  it("an unavailable effect store rolls back the sale and allows a clean retry", async () => {
    h.db.failEffect = true;
    await expect(walkIn()).rejects.toThrow("Injected effect intent failure");
    expect(h.db.state.effects).toHaveLength(0);
    expect(h.db.state.receipts).toHaveLength(0);
    expect(h.db.state.deductions).toHaveLength(0);
    expect(h.db.state.requests).toHaveLength(0);
    h.db.failEffect = false;
    await walkIn();
    expect(h.db.state.effects).toHaveLength(1);
  });
  it("persists one frozen Sheets event with the sale and does not recreate it on replay", async () => {
    h.sheets = true;
    await walkIn(); await walkIn();
    expect(h.db.state.sheetEvents).toHaveLength(1);
    const event = h.db.state.sheetEvents[0];
    expect(event.payload.values[8]).toBe(100);
    expect(event.payload.values[11]).toBe(event.eventId);
    h.db.state.orders.at(-1).totalAmount = 20;
    expect(event.payload.values[8]).toBe(100);
  });
  it.each(["failSheetEvent", "failRequestResult"])("%s rolls back the business writes and Sheets event together", async failure => {
    h.sheets = true; h.db[failure] = true;
    await expect(walkIn()).rejects.toThrow();
    expect(h.db.state.sheetEvents).toHaveLength(0);
    expect(h.db.state.orders).toHaveLength(2);
    expect(h.db.state.receipts).toHaveLength(0);
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


describe("Original consumption, stock settlement and refund correctness", () => {
  const removal = (id = 1, options = {}) => orderService.removeOrderItem(A, id, USER, "Fixture", { refund_option: "full", ...options });
  const cancel = (options = {}) => orderService.cancelOrDelete(A, USER, "Fixture", { refund_option: "full", ...options });
  it("retains distinct immutable snapshots for two adjustments and final cancellation", async () => {
    h.sheets = true;
    Object.assign(h.db.state.orders[0], { totalAmount: 120, subtotalAmount: 120, change: 80 });
    h.db.state.items.push({ orderItemId: 3, orderId: A, variantId: 1, quantity: 1, unitPrice: 20, subtotal: 20, discountType: "none", removedAt: null, isPrepared: false });
    await removal(1); await removal(2); await removal(3);
    expect(h.db.state.sheetEvents.map(event => event.kind)).toEqual(["adjusted", "adjusted", "cancelled"]);
    expect(h.db.state.sheetEvents.map(event => event.payload.values[8])).toEqual([60, 20, 0]);
    expect(new Set(h.db.state.sheetEvents.map(event => event.eventKey)).size).toBe(3);
    expect(new Set(h.db.state.sheetEvents.map(event => event.eventId)).size).toBe(3);
  });
  beforeEach(() => {
    orderService._restoreIngredients.mockRestore();
    h.db.reset([{ orderId: A, orderNumber: 1, status: "preparing", totalAmount: 100, subtotalAmount: 100, amountPaid: 200, change: 100, discountType: "none", consumptionRecordedAt: new Date() }], [
      { orderItemId: 1, orderId: A, variantId: 1, quantity: 1, unitPrice: 60, subtotal: 60, discountType: "none", removedAt: null, isPrepared: false },
      { orderItemId: 2, orderId: A, variantId: 1, quantity: 1, unitPrice: 40, subtotal: 40, discountType: "none", removedAt: null, isPrepared: false },
    ]);
    h.db.state.batches = [{ restockId: 7, ingredientId: B, quantityLeft: 2, version: 0, costPerUnit: 2 }, { restockId: 8, ingredientId: B, quantityLeft: 4, version: 0, costPerUnit: 6 }];
    h.db.state.deductions = [
      { id: 1, orderId: A, orderItemId: 1, ingredientId: B, restockBatchId: 7, quantityDeducted: 1.5, costPerUnit: 2, reversedAt: null },
      { id: 2, orderId: A, orderItemId: 1, ingredientId: B, restockBatchId: 8, quantityDeducted: .5, costPerUnit: 6, reversedAt: null },
      { id: 3, orderId: A, orderItemId: 2, ingredientId: B, restockBatchId: 8, quantityDeducted: 2, costPerUnit: 6, reversedAt: null },
    ];
    h.db.restockBatch = { findMany: async ({ where }) => structuredClone(h.db.state.batches.filter(row => where.restockId ? where.restockId.in.includes(row.restockId) : where.ingredientId.in.includes(row.ingredientId))) };
    vi.spyOn(orderRepository, "bulkRestoreBatches").mockImplementation(async rows => {
      if (h.db.failStock) return 0;
      for (const row of rows) {
        const batch = h.db.state.batches.find(batch => batch.restockId === row.restockId && batch.version === row.version);
        if (!batch) throw new Error("Version mismatch");
        batch.quantityLeft += row.quantity; batch.version++;
      }
      return rows.length;
    });
    vi.spyOn(orderRepository, "bulkDeductBatches").mockImplementation(async rows => {
      for (const row of rows) { const batch = h.db.state.batches.find(batch => batch.restockId === row.restockId && batch.version === row.version); if (!batch || batch.quantityLeft < row.quantity) return 0; batch.quantityLeft -= row.quantity; batch.version++; }
      return rows.length;
    });
    vi.spyOn(orderRepository, "getIngredientsTotalStocks").mockImplementation(async () => new Map([[B, h.db.state.batches.reduce((sum, row) => sum + row.quantityLeft, 0)]]));
    vi.spyOn(orderRepository, "getRecipesByVariantIds").mockResolvedValue([{ variantId: 1, ingredientId: B, quantityNeeded: 100 }]);
  });
  const stock = () => h.db.state.batches.reduce((sum, row) => sum + row.quantityLeft, 0);
  it("removal restores only its original batches despite changed recipes", async () => {
    await removal();
    expect(h.db.state.batches.map(row => row.quantityLeft)).toEqual([3.5, 4.5]);
    expect(h.db.state.deductions.map(row => !!row.reversedAt)).toEqual([true, true, false]);
    expect(h.db.state.orders[0].totalAmount).toBe(40);
    expect(h.db.state.refunds[0].amount).toBe(60);
    expect(orderRepository.getRecipesByVariantIds).not.toHaveBeenCalled();
  });
  it("two concurrent removals use fresh totals and cumulative refunds", async () => {
    await Promise.all([removal(1), removal(2)]);
    expect(h.db.state.refunds).toHaveLength(1);
    expect(h.db.state.refunds[0].amount).toBe(100);
    expect(stock()).toBe(10);
    expect(h.db.state.orders[0].status).toBe("cancelled");
  });
  it("repeating removal restores and refunds once", async () => {
    const results = await Promise.allSettled([removal(), removal()]);
    expect(results.filter(row => row.status === "fulfilled")).toHaveLength(1);
    expect(stock()).toBe(8);
    expect(h.db.state.refunds[0].amount).toBe(60);
  });
  it.each([true, false])("removal versus cancellation preserves stock and refund caps (remove first: %s)", async removeFirst => {
    await Promise.allSettled(removeFirst ? [removal(), cancel()] : [cancel(), removal()]);
    expect(stock()).toBe(10);
    expect(h.db.state.refunds[0].amount).toBe(100);
    expect(h.db.state.cancellations).toHaveLength(1);
    expect(h.db.state.deductions.every(row => row.reversedAt)).toBe(true);
  });
  it("partial loss settles consumption once and uses original batch costs", async () => {
    await removal(1, { loss_option: "with_loss", ingredient_losses: [{ ingredient_id: B, quantity_lost: 1.75 }] });
    expect(stock()).toBe(6.25);
    expect(h.db.state.losses[0]).toMatchObject({ quantityLost: 1.75, totalCostLost: 4.5 });
    expect(h.db.state.deductions[0]).toMatchObject({ quantityRestored: 0, quantityLost: 1.5 });
    expect(h.db.state.deductions[1]).toMatchObject({ quantityRestored: .25, quantityLost: .25 });
    await cancel();
    expect(stock()).toBe(8.25);
    expect(h.db.state.losses).toHaveLength(1);
    expect(h.db.state.items[0].removedLossOption).toBe("with_loss");
  });
  it("whole item loss consumes all slices without restoring stock", async () => {
    await removal(1, { loss_option: "with_loss", ingredient_losses: [{ ingredient_id: B, quantity_lost: 2 }] });
    expect(stock()).toBe(6);
    expect(h.db.state.losses[0].quantityLost).toBe(2);
    expect(h.db.state.adjustments).toHaveLength(0);
  });
  it.each([
    [{ ingredient_id: B, quantity_lost: 3 }],
    [{ ingredient_id: USER, quantity_lost: 1 }],
    [{ ingredient_id: B, quantity_lost: 1 }, { ingredient_id: B, quantity_lost: 1 }],
    [{ ingredient_id: B, quantity_lost: .0001 }],
    [{ ingredient_id: B, quantity_lost: -1 }],
  ].map(losses => [losses]))("rejects invalid loss declarations without writes (%j)", async ingredient_losses => {
    await expect(removal(1, { loss_option: "with_loss", ingredient_losses })).rejects.toMatchObject({ statusCode: 400 });
    expect(stock()).toBe(6);
    expect(h.db.state.deductions.every(row => !row.reversedAt)).toBe(true);
    expect(h.db.state.refunds).toHaveLength(0);
  });
  it.each(["failRefund", "failAdjustment", "failLoss", "failSettlement", "failStock"])("%s rolls back settlement, stock, item and totals", async failure => {
    h.db[failure] = true;
    await expect(removal(1, { loss_option: "with_loss", ingredient_losses: [{ ingredient_id: B, quantity_lost: .5 }] })).rejects.toThrow();
    expect(stock()).toBe(6);
    expect(h.db.state.deductions.every(row => !row.reversedAt)).toBe(true);
    expect(h.db.state.items[0].removedAt).toBeNull();
    expect(h.db.state.orders[0].totalAmount).toBe(100);
    expect(h.db.state.refunds).toHaveLength(0);
    expect(h.db.state.losses).toHaveLength(0);
    expect(h.db.state.adjustments).toHaveLength(0);
    h.db[failure] = false;
    await removal();
    expect(stock()).toBe(8);
  });
  it("failed cancellation rolls back restored stock and deduction settlement", async () => {
    h.db.failCancellation = true;
    await expect(cancel()).rejects.toThrow("Injected cancellation failure");
    expect(stock()).toBe(6);
    expect(h.db.state.orders[0].status).toBe("preparing");
    expect(h.db.state.deductions.every(row => !row.reversedAt)).toBe(true);
  });
  it("removing the discounted line does not discount the remaining regular line", async () => {
    Object.assign(h.db.state.items[0], { discountType: "senior", discountAmount: 12, discountPercent: 20 });
    Object.assign(h.db.state.orders[0], { totalAmount: 88, amountPaid: 88, change: 0, discountType: "senior", discountPercent: 20, discountAmount: 12 });
    await removal();
    expect(h.db.state.orders[0]).toMatchObject({ totalAmount: 40, discountAmount: 0 });
    expect(h.db.state.refunds[0].amount).toBe(48);
  });
  it("whole-bill input is stored on paid lines and survives partial removal", async () => {
    vi.spyOn(orderRepository, "getVariantPrices").mockResolvedValue(new Map([[1, 60], [2, 40]]));
    const result = await orderService._priceItemsAndTotals([
      { variant_id: 1, quantity: 1, unit_price: 60 },
      { variant_id: 2, quantity: 1, unit_price: 40 },
    ], { discount_type: "senior" });
    expect(result.pricedItems.map(item => item.discountAmount)).toEqual([12, 8]);
    result.pricedItems.forEach((item, index) => Object.assign(h.db.state.items[index], { discountType: item.discountType, discountAmount: item.discountAmount, discountPercent: item.discountPercent }));
    Object.assign(h.db.state.orders[0], { totalAmount: 80, amountPaid: 100, change: 20, discountAmount: 20, discountType: "senior" });
    await removal();
    expect(h.db.state.orders[0].totalAmount).toBe(32);
    expect(h.db.state.refunds[0].amount).toBe(48);
  });
  it("historical item removal and partial cancellation fail closed", async () => {
    h.db.state.orders[0].consumptionRecordedAt = null;
    await expect(removal()).rejects.toMatchObject({ code: "CONSUMPTION_HISTORY_REQUIRED" });
    await expect(cancel({ loss_option: "with_loss", item_losses: [{ order_item_id: 1, ingredient_losses: [{ ingredient_id: B, quantity_lost: 1 }] }] })).rejects.toMatchObject({ code: "CONSUMPTION_HISTORY_REQUIRED" });
    expect(stock()).toBe(6);
    expect(h.db.state.orders[0].status).toBe("preparing");
  });
  it("recipe-free paid items can be removed without inventing consumption", async () => {
    h.db.state.deductions = [];
    await removal();
    expect(stock()).toBe(6);
    expect(h.db.state.refunds[0].amount).toBe(60);
  });
  it("empty loss selection restores stock rather than inventing full loss", async () => {
    await removal(1, { loss_option: "with_loss" });
    expect(stock()).toBe(8);
    expect(h.db.state.losses).toHaveLength(0);
    expect(h.db.state.items[0].removedLossOption).toBe("no_loss");
  });
  it("accepted items cannot declare preparation losses through a direct call", async () => {
    h.db.state.orders[0].status = "accepted";
    await removal(1, { loss_option: "with_loss", ingredient_losses: [{ ingredient_id: B, quantity_lost: 2 }] });
    expect(stock()).toBe(8);
    expect(h.db.state.losses).toHaveLength(0);
  });
  it("historical cancellation after prior removal requires reconciliation", async () => {
    h.db.state.orders[0].consumptionRecordedAt = null;
    h.db.state.items[0].removedAt = new Date();
    await expect(cancel()).rejects.toMatchObject({ code: "CONSUMPTION_HISTORY_REQUIRED" });
    expect(stock()).toBe(6);
    expect(h.db.state.orders[0].status).toBe("preparing");
  });
  it("detail loss inputs expose original consumption instead of changed recipes", async () => {
    orderService.getById.mockRestore();
    vi.spyOn(orderRepository, "getOrderItemLosses").mockResolvedValue([]);
    const detail = await orderService.getById(A);
    expect(detail.consumption_history_available).toBe(true);
    expect(detail.items[0].recipes[0]).toMatchObject({ ingredient_id: B, quantity_needed: 2, cost_per_unit: 3 });
    expect(orderRepository.getRecipesByVariantIds).not.toHaveBeenCalled();
  });
  it("deduction records are allocated to persisted item IDs in exact milli-units", async () => {
    h.db.state.deductions = [];
    h.db.state.orders[0].consumptionRecordedAt = null;
    const recipes = [{ variantId: 1, ingredientId: B, quantityNeeded: .333 }];
    await h.db.$transaction(tx => orderService._deductIngredients(A, new Map([[B, .666]]), tx, USER, recipes));
    expect(h.db.state.deductions.map(row => [row.orderItemId, row.quantityDeducted])).toEqual([[1, .333], [2, .333]]);
    expect(h.db.state.orders[0].consumptionRecordedAt).toBeTruthy();
  });
  it.each(["failDeduction", "failAdjustment"])("%s rolls back original consumption and stock deduction", async failure => {
    h.db.state.deductions = [];
    h.db.state.orders[0].consumptionRecordedAt = null;
    h.db[failure] = true;
    const recipes = [{ variantId: 1, ingredientId: B, quantityNeeded: .333 }];
    await expect(h.db.$transaction(tx => orderService._deductIngredients(A, new Map([[B, .666]]), tx, USER, recipes))).rejects.toThrow();
    expect(stock()).toBe(6);
    expect(h.db.state.deductions).toHaveLength(0);
    expect(h.db.state.orders[0].consumptionRecordedAt).toBeNull();
  });
});

describe("Consumption allocation invariants", () => {
  const items = [{ orderItemId: 1, variantId: 1, quantity: 2 }, { orderItemId: 2, variantId: 1, quantity: 1 }];
  const recipes = [{ variantId: 1, ingredientId: B, quantityNeeded: .333 }];
  const slices = [{ orderId: A, ingredientId: B, restockBatchId: 7, quantityDeducted: .5, costPerUnit: 2 }, { orderId: A, ingredientId: B, restockBatchId: 8, quantityDeducted: .499, costPerUnit: 3 }];
  it("conserves each item and batch across fractional FIFO slices", () => {
    expect(allocateConsumption(items, recipes, slices).map(row => [row.orderItemId, row.restockBatchId, row.quantityDeducted])).toEqual([[1, 7, .5], [1, 8, .166], [2, 8, .333]]);
  });
  it.each([.9, 1.1])("rejects unmatched aggregate deduction %s", quantityDeducted => {
    expect(() => allocateConsumption(items, recipes, [{ ...slices[0], quantityDeducted }])).toThrow();
  });
  it.each([NaN, Infinity, -1, .0001])("rejects unrepresentable stock quantity %s", value => expect(() => stockUnits(value)).toThrow());
  it("rejects cross-item consumption and duplicate loss item IDs", () => {
    const rows = [{ ...slices[0], id: 1, orderItemId: 3 }];
    expect(() => planSettlement(items, rows)).toThrow();
    expect(() => planSettlement(items, [], [{ order_item_id: 1 }, { order_item_id: 1 }])).toThrow();
  });
  it("whole-bill cent allocation preserves the paid discount without exceeding any line", () => {
    const discounted = allocateBillDiscount(Array.from({ length: 3 }, () => ({ unit_price: .01, quantity: 1 })), { discountType: "promo", discountPercent: 0, discountAmount: .02 });
    expect(discounted.reduce((sum, item) => sum + Math.round(item.discountAmount * 100), 0)).toBe(2);
    expect(discounted.every(item => item.discountAmount <= .01)).toBe(true);
  });
});
