import { beforeAll, afterAll, beforeEach, it, expect, vi } from "vitest";
import express from "express";
const h = vi.hoisted(() => ({ role: "admin", count: vi.fn() }));
vi.mock("../src/modules/shifts/shift.service.js", () => ({ shiftService: { getOpenCount: h.count } }));
vi.mock("../src/middleware/authenticate.middleware.js", () => ({ default: (req, res, next) => {
  if (!h.role) return res.sendStatus(401);
  req.user = { id: "fixture", role: h.role }; next();
} }));
import router from "../src/modules/shifts/shift.routes.js";
let server, base;
beforeAll(async () => {
  const app = express(); app.use("/shifts", router);
  server = await new Promise(resolve => { const listener = app.listen(0, "127.0.0.1", () => resolve(listener)); });
  base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
beforeEach(() => { h.role = "admin"; h.count.mockReset().mockResolvedValue(3); });
it("returns only the global open-shift count for an admin", async () => {
  const res = await fetch(`${base}/shifts/open-count`);
  expect(res.status).toBe(200); expect((await res.json()).data).toEqual({ count: 3 });
  expect(h.count).toHaveBeenCalledOnce();
});
it.each(["cashier", "kitchen", null])("denies non-admin count access: %s", async role => {
  h.role = role;
  expect((await fetch(`${base}/shifts/open-count`)).status).toBe(role ? 403 : 401);
  expect(h.count).not.toHaveBeenCalled();
});
