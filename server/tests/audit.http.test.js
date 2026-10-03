// Audit HTTP boundary tests. Real Express routing/middleware; fake DB, controllers and services.
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
const h = vi.hoisted(() => ({ role: "cashier", proxy: () => new Proxy({}, { get: () => (req, res) => res.json({ success: true, auditHandlerReached: true }) }) }));
vi.mock("../src/config/env.js", () => ({ env: { NODE_ENV: "test", CLIENT_URL: "http://127.0.0.1:5189", JWT_SECRET: "audit-only-secret-never-used-for-real-authentication", JWT_EXPIRES_IN: "8h" } }));
vi.mock("../src/config/prisma.js", () => ({ default: { user: { findUnique: async () => ({ id: "123e4567-e89b-42d3-a456-426614174000", role: h.role, isActive: true, sessionVersion: 0 }) } } }));
vi.mock("../src/middleware/upload.middleware.js", () => ({ uploadProductImage: (req,res,next) => next(), uploadAvatar: (req,res,next) => next() }));
vi.mock("../src/modules/auditLogs/auditLog.service.js", () => ({ auditLogService: { logAction: vi.fn().mockResolvedValue({}) } }));
vi.mock("../src/realtime/jobs.js", () => ({ proxyMlStatus: vi.fn() }));
vi.mock("../src/modules/auth/auth.controller.js", () => ({ authController: h.proxy() }));
vi.mock("../src/modules/categories/category.controller.js", () => ({ categoryController: h.proxy() }));
vi.mock("../src/modules/ingredients/ingredient.controller.js", () => ({ ingredientController: h.proxy() }));
vi.mock("../src/modules/products/product.controller.js", () => ({ productController: h.proxy() }));
vi.mock("../src/modules/orders/order.controller.js", () => ({ orderController: h.proxy() }));
vi.mock("../src/modules/guest/guest.controller.js", () => ({ guestController: h.proxy() }));
vi.mock("../src/modules/staff/staff.controller.js", () => ({ staffController: h.proxy() }));
vi.mock("../src/modules/reorderSuggestions/reorderSuggestions.controller.js", () => ({ reorderSuggestionsController: h.proxy() }));
vi.mock("../src/modules/wasteReduction/wasteReduction.controller.js", () => ({ wasteReductionController: h.proxy() }));
vi.mock("../src/modules/priceOptimization/priceOptimization.controller.js", () => ({ default: h.proxy() }));
vi.mock("../src/modules/settings/settings.controller.js", () => ({ settingsController: h.proxy() }));
vi.mock("../src/modules/auditLogs/auditLog.controller.js", () => ({ auditLogController: h.proxy() }));
vi.mock("../src/modules/dashboard/dashboard.controller.js", () => ({ dashboardController: h.proxy() }));
vi.mock("../src/modules/notifications/notification.controller.js", () => ({ notificationController: h.proxy() }));
vi.mock("../src/modules/anomalyDetection/anomalyDetection.controller.js", () => ({ anomalyController: h.proxy() }));
vi.mock("../src/modules/shifts/shift.controller.js", () => ({ shiftController: h.proxy() }));
vi.mock("../src/modules/transactions/transaction.controller.js", () => ({ transactionController: h.proxy() }));
vi.mock("../src/modules/analytics/analytics.controller.js", () => ({ analyticsController: h.proxy() }));
import app from "../src/app.js";
import { signToken } from "../src/config/jwt.js";
const matrix = JSON.parse(fs.readFileSync(new URL("../../audit/endpoint-inventory.json", import.meta.url), "utf8"));
let server, base;
const results = [];
function concrete(url) { return url.replace(/:(itemId|variantId|batchId|lossId)/g, "1").replace(/:token/g, "123e4567-e89b-42d3-a456-426614174000").replace(/:id/g, "123e4567-e89b-42d3-a456-426614174000"); }
beforeAll(async () => { server = await new Promise(resolve => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); }); base = "http://127.0.0.1:" + server.address().port; });
afterAll(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); fs.writeFileSync(new URL("../../audit/http-boundary-results.json", import.meta.url), JSON.stringify(results, null, 2)); });
describe("AUDIT: HTTP authentication and role boundaries", () => {
  for (const row of matrix.filter(r => r.auth !== "public")) {
    it("unauthenticated request blocked: " + row.method + " " + row.endpoint, async () => {
      const r = await fetch(base + concrete(row.endpoint), { method: row.method });
      results.push({ method: row.method, endpoint: row.endpoint, scenario: "no session", status: r.status, expected: 401 });
      expect(r.status).toBe(401);
    });
  }
  for (const row of matrix.filter(r => r.roles === "admin")) {
    it("cashier blocked: " + row.method + " " + row.endpoint, async () => {
      h.role = "cashier";
      const r = await fetch(base + concrete(row.endpoint), { method: row.method, headers: { Cookie: "token=" + signToken({ sub: "123e4567-e89b-42d3-a456-426614174000", role: "cashier", version: 0 }) } });
      results.push({ method: row.method, endpoint: row.endpoint, scenario: "cashier accessing admin endpoint", status: r.status, expected: 403 });
      expect(r.status).toBe(403);
    });
  }
  it("kitchen role cannot reach payment-acceptance status handler", async () => {
    h.role = "kitchen";
    const r = await fetch(base + "/api/orders/123e4567-e89b-42d3-a456-426614174000/status", { method: "PUT", headers: { "Content-Type": "application/json", Cookie: "token=" + signToken({ sub: "123e4567-e89b-42d3-a456-426614174000", role: "kitchen", version: 0 }) }, body: JSON.stringify({ status: "accepted", amount_paid: 100 }) });
    results.push({ scenario: "kitchen is blocked from acceptance/payment handler", status: r.status, expected: 403 });
    expect(r.status).toBe(403);
  });
  it("malformed JSON returns a safe 400 from the real Express stack", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await fetch(base + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" });
    expect(r.status).toBe(400); spy.mockRestore();
    results.push({ scenario: "malformed JSON", status: r.status, desired: 400 });
  });
});
