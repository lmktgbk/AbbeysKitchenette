import { beforeAll, afterAll, beforeEach, it, expect, vi } from "vitest";
import express from "express";
const h = vi.hoisted(() => ({ role: "admin", prioritize: vi.fn(), expiredLoss: vi.fn() }));
vi.mock("../src/modules/wasteReduction/wasteReduction.service.js", () => ({ wasteReductionService: {
  prioritize: h.prioritize, expiredLoss: h.expiredLoss,
} }));
vi.mock("../src/middleware/authenticate.middleware.js", () => ({ default: (req, res, next) => {
  if (!h.role) return res.sendStatus(401);
  req.user = { id: "admin", role: h.role }; next();
} }));
import router from "../src/modules/wasteReduction/wasteReduction.routes.js";
import errorHandler from "../src/middleware/errorHandler.middleware.js";
let server, base;
const id = "00000000-0000-4000-8000-000000000001";
beforeAll(async () => {
  const app = express(); app.use(express.json()); app.use("/waste", router); app.use(errorHandler);
  server = await new Promise(resolve => { const listener = app.listen(0, "127.0.0.1", () => resolve(listener)); });
  base = `http://127.0.0.1:${server.address().port}/waste`;
});
afterAll(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
beforeEach(() => { vi.clearAllMocks(); h.role = "admin"; h.prioritize.mockResolvedValue({}); h.expiredLoss.mockResolvedValue({}); });
it.each(["prioritize", "expired-loss"])("requires admin access for %s", async action => {
  h.role = "cashier";
  expect((await fetch(`${base}/${id}/batches/1/${action}`, { method: "POST" })).status).toBe(403);
  h.role = null;
  expect((await fetch(`${base}/${id}/batches/1/${action}`, { method: "POST" })).status).toBe(401);
  expect(h.prioritize).not.toHaveBeenCalled(); expect(h.expiredLoss).not.toHaveBeenCalled();
});
it.each(["0", "-1", "1.5", "not-a-batch", "2147483648"])("rejects invalid batch ID %s before mutation", async batch => {
  expect((await fetch(`${base}/${id}/batches/${batch}/prioritize`, { method: "POST" })).status).toBe(400);
  expect(h.prioritize).not.toHaveBeenCalled();
});
it.each([["prioritize", "prioritize"], ["expired-loss", "expiredLoss"]])("passes validated IDs and actor to %s", async (action, method) => {
  expect((await fetch(`${base}/${id}/batches/12/${action}`, { method: "POST" })).status).toBe(200);
  expect(h[method]).toHaveBeenCalledWith(id, 12, "admin");
});
