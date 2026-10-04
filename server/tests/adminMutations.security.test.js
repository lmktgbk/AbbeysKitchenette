import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from "vitest";
import express from "express";
const h = vi.hoisted(() => ({ role: null, calls: 0 }));
vi.mock("../src/middleware/authenticate.middleware.js", () => ({ default: (req, res, next) => {
  if (!h.role) return res.status(401).json({ error: "UNAUTHORIZED" });
  req.user = { id: "00000000-0000-4000-8000-000000000001", role: h.role }; next();
} }));
vi.mock("../src/middleware/upload.middleware.js", () => ({ uploadProductImage: (_req, _res, next) => next(), productUploadBody: (_req, _res, next) => next() }));
vi.mock("../src/modules/products/product.controller.js", () => ({ productController: new Proxy({}, { get: () => (_req, res) => { h.calls++; res.sendStatus(204); } }) }));
vi.mock("../src/modules/categories/category.controller.js", () => ({ categoryController: new Proxy({}, { get: () => (_req, res) => { h.calls++; res.sendStatus(204); } }) }));
vi.mock("../src/modules/staff/staff.controller.js", () => ({ staffController: new Proxy({}, { get: () => (_req, res) => { h.calls++; res.sendStatus(204); } }) }));
vi.mock("../src/modules/settings/settings.controller.js", () => ({ settingsController: new Proxy({}, { get: () => (_req, res) => { h.calls++; res.sendStatus(204); } }) }));
import products from "../src/modules/products/product.routes.js";
import categories from "../src/modules/categories/category.routes.js";
import staff from "../src/modules/staff/staff.routes.js";
import settings from "../src/modules/settings/settings.routes.js";
import errorHandler from "../src/middleware/errorHandler.middleware.js";
let server, base;
const uuid = "00000000-0000-4000-8000-000000000002";
const mutations = [
  ["POST", "/products"], ["PATCH", `/products/${uuid}`], ["PUT", `/products/${uuid}/variants`],
  ["POST", `/products/${uuid}/activate`], ["POST", `/products/${uuid}/deactivate`],
  ["POST", `/products/${uuid}/variants/1/activate`], ["POST", `/products/${uuid}/variants/1/deactivate`], ["DELETE", `/products/${uuid}`],
  ["POST", "/categories/1/subcategories"], ["PATCH", "/categories/subcategories/1"], ["DELETE", "/categories/subcategories/1"],
  ["POST", "/staff"], ["PATCH", `/staff/${uuid}`], ["PATCH", `/staff/${uuid}/toggle-active`], ["DELETE", `/staff/${uuid}`], ["PATCH", "/settings"],
];
beforeAll(async () => {
  const app = express(); app.use(express.json()); app.use("/products", products); app.use("/categories", categories); app.use("/staff", staff); app.use("/settings", settings); app.use(errorHandler);
  server = await new Promise(resolve => { const listener = app.listen(0, "127.0.0.1", () => resolve(listener)); });
  base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
beforeEach(() => { h.role = null; h.calls = 0; });
describe("Administrative mutation access boundaries", () => {
  it.each([null, "cashier", "kitchen"])("role %s cannot enter any mutation controller", async role => {
    h.role = role;
    for (const [method, path] of mutations) {
      const response = await fetch(`${base}${path}`, { method, headers: { "content-type": "application/json" }, body: "{}" });
      expect(response.status, `${method} ${path}`).toBe(role ? 403 : 401);
    }
    expect(h.calls).toBe(0);
  });
  it.each(["abc", "-1", "1abc", "2147483648"])("subcategory PATCH rejects malformed ID %s before controller", async id => {
    h.role = "admin";
    const response = await fetch(`${base}/categories/subcategories/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ is_active: false }) });
    expect(response.status).toBe(400); expect(h.calls).toBe(0);
  });
});
