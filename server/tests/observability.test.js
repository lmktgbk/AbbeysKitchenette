import { EventEmitter } from "node:events";
import express from "express";
import cookieParser from "cookie-parser";
import { beforeAll, afterAll, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ user: { id: "00000000-0000-4000-8000-000000000001", role: "admin", sessionVersion: 0, isActive: true } }));
vi.mock("../src/config/prisma.js", () => ({ databasePool: {}, default: { user: { findUnique: async () => h.user } } }));
vi.mock("../src/config/env.js", () => ({ env: { JWT_SECRET: "operations-fixture-secret-at-least-32-characters", JWT_EXPIRES_IN: "8h" } }));
import { createRequestTelemetry, createQueueSnapshot, operationsRoutes } from "../src/services/observability.js";
import errorHandler from "../src/middleware/errorHandler.middleware.js";
import { signToken } from "../src/config/jwt.js";
let server, base;
beforeAll(async () => {
  const app = express(); app.use(cookieParser());
  app.use("/operations", operationsRoutes({ telemetry: { snapshot: () => [] }, queues: async () => [{ component: "effects", status: "blocked", count: 1 }] }));
  app.use(errorHandler);
  server = await new Promise(resolve => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); }); base = `http://127.0.0.1:${server.address().port}/operations/metrics`;
});
afterAll(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
it("denies unauthenticated metrics access", async () => { expect((await fetch(base)).status).toBe(401); });
it("denies cashier metrics access even with a valid session", async () => {
  h.user.role = "cashier";
  const token = signToken({ sub: h.user.id, role: "cashier", version: 0 });
  expect((await fetch(base, { headers: { Authorization: `Bearer ${token}` } })).status).toBe(403);
});
it("returns no-store metrics only for an active admin", async () => {
  h.user.role = "admin";
  const token = signToken({ sub: h.user.id, role: "admin", version: 0 });
  const response = await fetch(base, { headers: { Authorization: `Bearer ${token}` } });
  expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
  expect((await response.json()).data.queues[0].status).toBe("blocked");
});
it("production unexpected errors retain correlation without raw secret values", () => {
  vi.stubEnv("NODE_ENV", "production"); const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  try {
    errorHandler(Error("postgres password=private provider-token"), { requestId: "fixture-reference" }, res, () => {});
    expect(log.mock.calls.flat().join(" ")).not.toContain("private");
    expect(res.json.mock.calls[0][0].reference).toBe("fixture-reference");
  } finally { log.mockRestore(); vi.unstubAllEnvs(); }
});
it("records template routes without URLs, credentials or user data", () => {
  const write = vi.fn(), now = vi.fn().mockReturnValueOnce(10).mockReturnValueOnce(55);
  const telemetry = createRequestTelemetry({ write, now }), res = new EventEmitter(); res.setHeader = vi.fn(); res.statusCode = 401;
  const req = { method: "GET", baseUrl: "/api/orders", route: { path: "/:id" }, url: "/secret?token=private", headers: { authorization: "secret" } };
  telemetry.middleware(req, res, () => {}); res.emit("finish");
  const event = JSON.parse(write.mock.calls[0][0]); expect(event).toMatchObject({ route: "/api/orders/:id", status: 401, durationMs: 45 });
  expect(write.mock.calls[0][0]).not.toContain("secret"); expect(write.mock.calls[0][0]).not.toContain("private");
  expect(telemetry.snapshot()[0]).toMatchObject({ requests: 1, authFailures: 1, errors: 0 });
});
it("does not label unmatched requests with attacker-controlled paths", () => {
  const telemetry = createRequestTelemetry({ write: () => {} });
  for (let i = 0; i < 500; i++) {
    const res = new EventEmitter(); res.setHeader = () => {}; res.statusCode = 404;
    telemetry.middleware({ method: "GET", url: `/unknown/${i}` }, res, () => {}); res.emit("finish");
  }
  expect(telemetry.snapshot()).toHaveLength(1);
});
it("coalesces queue probes and caches only successful results", async () => {
  const query = vi.fn().mockRejectedValueOnce(Error("down")).mockResolvedValue({ rows: [{ component: "effects", status: "blocked", count: 1 }] });
  const snapshot = createQueueSnapshot({ query }); await expect(snapshot()).rejects.toThrow("down");
  const [one, two] = await Promise.all([snapshot(), snapshot()]); expect(one).toEqual(two); await snapshot();
  expect(query).toHaveBeenCalledTimes(2); expect(query.mock.calls[0][0].query_timeout).toBe(2500);
});
