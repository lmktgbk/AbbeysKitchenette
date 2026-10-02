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
vi.mock("../src/modules/shifts/shift.service.js", () => ({ shiftService: {} }));
vi.mock("../src/modules/settings/settings.service.js", () => ({ settingsService: {} }));
vi.mock("../src/modules/anomalyDetection/anomalyDetection.service.js", () => ({ anomalyService: { runScan: vi.fn().mockResolvedValue({}) } }));
vi.mock("../src/modules/sheets/sheets.service.js", () => ({ sheetsService: { enqueue: vi.fn() } }));
vi.mock("../src/realtime/events.js", () => ({ emitOrderChanged: vi.fn(), emitStockChanged: vi.fn(), emitGuestForOrder: vi.fn() }));

import router from "../src/modules/orders/order.routes.js";
import errorHandler from "../src/middleware/errorHandler.middleware.js";
import { orderService } from "../src/modules/orders/order.service.js";
import { orderRepository } from "../src/modules/orders/order.repository.js";

const A = "123e4567-e89b-42d3-a456-426614174001";
const B = "123e4567-e89b-42d3-a456-426614174002";
const USER = "123e4567-e89b-42d3-a456-426614174000";
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
const request = (path, method, body) => fetch(base + path, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

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
    const acceptance = vi.spyOn(orderService, "_handleAcceptance").mockResolvedValue({ order_id: A });
    expect((await request(`/${A}/status`, "PUT", { status: "accepted", amount_paid: 100 })).status).toBe(200);
    expect(acceptance).toHaveBeenCalledWith(A, expect.any(Object), expect.objectContaining({ userRole: role, userId: USER }));
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
