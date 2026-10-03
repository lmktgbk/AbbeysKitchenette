// Exercise the real route/controller boundary; substitute only database-backed analytics.
import express from "express";
import cookieParser from "cookie-parser";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ trend: vi.fn(), dashboard: vi.fn() }));
vi.mock("../src/config/env.js", () => ({ env: { NODE_ENV: "test", JWT_SECRET: "dashboard-test-secret-at-least-32-characters", JWT_EXPIRES_IN: "8h" } }));
vi.mock("../src/config/prisma.js", () => ({ default: { user: { findUnique: async () => ({ id: "123e4567-e89b-42d3-a456-426614174000", role: "admin", isActive: true, sessionVersion: 0 }) } } }));
vi.mock("../src/modules/dashboard/dashboard.repository.js", () => ({ dashboardRepository: { getRevenueTrend: h.trend } }));
vi.mock("../src/modules/dashboard/dashboard.service.js", () => ({ dashboardService: { getData: h.dashboard } }));
import router from "../src/modules/dashboard/dashboard.routes.js";
import errorHandler from "../src/middleware/errorHandler.middleware.js";
import { signToken } from "../src/config/jwt.js";
let server, base, cookie;
beforeAll(async () => {
  const app = express(); app.use(cookieParser()); app.use("/dashboard", router); app.use(errorHandler);
  server = await new Promise(resolve => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
  base = `http://127.0.0.1:${server.address().port}/dashboard`;
  cookie = "token=" + signToken({ sub: "123e4567-e89b-42d3-a456-426614174000", role: "admin", version: 0 });
});
afterAll(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
beforeEach(() => { h.trend.mockReset().mockResolvedValue([{ revenue: 10 }]); h.dashboard.mockReset().mockResolvedValue({ revenue: 10 }); });
const get = path => fetch(base + path, { headers: { Cookie: cookie } });
describe("dashboard validated query flow", () => {
  it.each(["daily", "weekly", "monthly"])("%s reaches the real controller with validated data", async granularity => {
    const response = await get(`/revenue-trend?granularity=${granularity}`);
    expect(response.status).toBe(200); expect((await response.json()).data).toEqual([{ revenue: 10 }]);
    expect(h.trend).toHaveBeenCalledWith(null, null, granularity);
  });
  it("applies the default granularity and forwards validated dates", async () => {
    expect((await get("/revenue-trend?dateFrom=2026-10-01&dateTo=2026-10-03")).status).toBe(200);
    expect(h.trend).toHaveBeenCalledWith("2026-10-01", "2026-10-03", "daily");
  });
  it.each(["granularity=invalid", "granularity=weekly&granularity=monthly", "dateFrom=2026-02-30", "dateFrom=2026-10-04&dateTo=2026-10-03"])("invalid input returns 400 before analytics work: %s", async query => {
    expect((await get(`/revenue-trend?${query}`)).status).toBe(400); expect(h.trend).not.toHaveBeenCalled();
  });
  it("the consolidated dashboard uses the same validated date contract", async () => {
    expect((await get("?dateFrom=2026-10-01")).status).toBe(200);
    expect(h.dashboard).toHaveBeenCalledWith("2026-10-01", null);
  });
  it("unauthenticated trend requests remain blocked", async () => {
    expect((await fetch(base + "/revenue-trend?granularity=weekly")).status).toBe(401); expect(h.trend).not.toHaveBeenCalled();
  });
});
