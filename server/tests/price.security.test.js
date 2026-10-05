import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from "vitest";
import express from "express";

const h = vi.hoisted(() => ({ db: null, role: "admin" }));
vi.mock("../src/config/prisma.js", () => ({ default: new Proxy({}, { get: (_target, key) => h.db[key] }) }));
vi.mock("../src/modules/priceOptimization/priceOptimization.prompts.js", () => ({ generatePriceSuggestions: vi.fn() }));
vi.mock("../src/middleware/authenticate.middleware.js", () => ({ default: (req, _res, next) => {
  req.user = { id: "00000000-0000-4000-8000-000000000001", role: h.role };
  next();
} }));
vi.mock("../src/modules/auditLogs/auditLog.service.js", () => ({ auditLogService: { logAction: vi.fn().mockResolvedValue({}) } }));

import service from "../src/modules/priceOptimization/priceOptimization.service.js";
import repo from "../src/modules/priceOptimization/priceOptimization.repository.js";
import router from "../src/modules/priceOptimization/priceOptimization.routes.js";
import errorHandler from "../src/middleware/errorHandler.middleware.js";
import { auditLogService } from "../src/modules/auditLogs/auditLog.service.js";

let server, base;
beforeAll(async () => {
  const app = express(); app.use(express.json()); app.use("/prices", router); app.use(errorHandler);
  server = await new Promise(resolve => { const listener = app.listen(0, "127.0.0.1", () => resolve(listener)); });
  base = `http://127.0.0.1:${server.address().port}/prices`;
});
afterAll(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });

beforeEach(() => {
  vi.clearAllMocks(); h.role = "admin";
  const state = { suggestions: [{ id: 1, variantId: 7, policyVersion: 3, currentPrice: 85, recommendedPrice: 90, productName: "Fixture", status: "pending" }], variants: [{ variantId: 7, price: 85, archived: false }], priceWrites: 0, effects: [] };
  const db = h.db = { state };
  db.domainEffect = { async create({ data }) {
    if (db.failEffect) throw new Error("Injected effect failure");
    db.state.effects.push(structuredClone(data)); return data;
  } };
  db.priceOptimization = {
    async findUnique({ where }) { return structuredClone(db.state.suggestions.find(row => row.id === where.id)); },
    async updateMany({ where, data }) {
      if (db.failStatus) throw new Error("Injected status failure");
      const row = db.state.suggestions.find(row => row.id === where.id && row.status === where.status);
      if (!row) return { count: 0 };
      Object.assign(row, data); return { count: 1 };
    },
    async deleteMany() { db.state.suggestions = db.state.suggestions.filter(row => row.status !== "pending"); },
    async createMany({ data }) {
      if (db.failInsert) throw new Error("Injected insert failure");
      db.state.suggestions.push(...structuredClone(data)); return { count: data.length };
    },
  };
  db.$executeRaw = async (_sql, price, id, expected) => {
    if (db.failPrice) throw new Error("Injected price failure");
    const row = db.state.variants.find(row => row.variantId === id && row.price === Number(expected) && !row.archived);
    if (!row) return 0;
    row.price = Number(price); db.state.priceWrites++; return 1;
  };
  db.$queryRaw = async sql => sql.join("").includes("FROM products")
    ? [{ product_name: "Fixture", is_archived: false }]
    : [{ variant_id: 7, size_name: "Regular", price: db.state.variants[0].price }];
  // The double verifies atomicity, rollback and alternate request ordering;
  // PostgreSQL row-lock scheduling needs the final multi-connection tests.
  let queue = Promise.resolve();
  db.$transaction = async callback => {
    const previous = queue; let release; queue = new Promise(resolve => { release = resolve; }); await previous;
    const before = structuredClone(db.state);
    try { return await callback(db); }
    catch (error) { db.state = before; throw error; }
    finally { release(); }
  };
});
const request = (id, action) => fetch(`${base}/${id}/${action}`, { method: "POST" });

describe("Price approval authorization and transactional correctness", () => {
  it("requires regeneration of legacy suggestions without changing their status", async () => {
    h.db.state.suggestions[0].policyVersion = 1;
    await expect(service.applyPrice(1)).rejects.toMatchObject({ code: "PRICE_POLICY_OUTDATED" });
    expect(h.db.state.suggestions[0].status).toBe("pending");
    expect(h.db.state.priceWrites).toBe(0);
  });
  it("admin approval commits the price and status together with matching response metadata", async () => {
    const response = await request(1, "apply");
    expect(response.status).toBe(200);
    const result = (await response.json()).data.suggestion;
    expect(result).toMatchObject({ status: "accepted", variantId: 7, recommendedPrice: 90 });
    expect(result.updatedAt).toBe(h.db.state.suggestions[0].updatedAt.toISOString());
    expect(h.db.state.variants[0].price).toBe(90);
    expect(h.db.state.effects).toHaveLength(1);
    expect(h.db.state.effects[0].payload.audit.userId).toBe("00000000-0000-4000-8000-000000000001");
  });
  it.each(["cashier", "kitchen"])("%s cannot apply or dismiss through either route", async role => {
    h.role = role;
    expect((await request(1, "apply")).status).toBe(403);
    expect((await request(1, "dismiss")).status).toBe(403);
    expect(h.db.state.priceWrites).toBe(0);
    expect(h.db.state.suggestions[0].status).toBe("pending");
  });
  it.each([0, "-1", "abc", "2147483648", "999999999999999999999"])("invalid ID %s returns 400 before any write", async id => {
    expect((await request(id, "apply")).status).toBe(400);
    expect(h.db.state.priceWrites).toBe(0);
  });
  it("missing suggestion returns 404", async () => expect((await request(99, "apply")).status).toBe(404));
  it.each(["accepted", "rejected"])("%s suggestion cannot be applied or dismissed again", async status => {
    h.db.state.suggestions[0].status = status;
    expect((await request(1, "apply")).status).toBe(409);
    expect((await request(1, "dismiss")).status).toBe(409);
    expect(h.db.state.priceWrites).toBe(0);
  });
  it("stale current price leaves the recommendation pending", async () => {
    h.db.state.variants[0].price = 90;
    const response = await request(1, "apply");
    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe("STALE_PRICE_SUGGESTION");
    expect(h.db.state.suggestions[0].status).toBe("pending");
    expect(h.db.state.variants[0].price).toBe(90);
    expect(auditLogService.logAction).not.toHaveBeenCalled();
  });
  it.each(["archived", "deleted"])("%s target is not changed", async mode => {
    if (mode === "archived") h.db.state.variants[0].archived = true;
    else h.db.state.variants = [];
    await expect(service.applyPrice(1)).rejects.toMatchObject({ statusCode: 409 });
    expect(h.db.state.suggestions[0].status).toBe("pending");
  });
  it.each([0, -1, NaN, Infinity, 100000000, 85.001])("invalid recommended price %s rolls back the claim", async price => {
    h.db.state.suggestions[0].recommendedPrice = price;
    await expect(service.applyPrice(1)).rejects.toMatchObject({ statusCode: 400 });
    expect(h.db.state.suggestions[0].status).toBe("pending");
    expect(h.db.state.variants[0].price).toBe(85);
  });
  it.each(["failStatus", "failPrice", "failEffect"])("%s cannot leave a partially approved price", async failure => {
    h.db[failure] = true;
    await expect(service.applyPrice(1)).rejects.toThrow("Injected");
    expect(h.db.state.suggestions[0].status).toBe("pending");
    expect(h.db.state.variants[0].price).toBe(85);
    h.db[failure] = false;
    await service.applyPrice(1);
    expect(h.db.state.variants[0].price).toBe(90);
  });
  it("duplicate approvals have one winner and one price write", async () => {
    const results = await Promise.allSettled([service.applyPrice(1), service.applyPrice(1)]);
    expect(results.filter(row => row.status === "fulfilled")).toHaveLength(1);
    expect(h.db.state.priceWrites).toBe(1);
    expect(h.db.state.effects).toHaveLength(1);
  });
  it.each([true, false])("apply versus dismiss has one resolution (apply first: %s)", async applyFirst => {
    const results = await Promise.allSettled(applyFirst ? [service.applyPrice(1), service.dismiss(1)] : [service.dismiss(1), service.applyPrice(1)]);
    expect(results.filter(row => row.status === "fulfilled")).toHaveLength(1);
    expect(h.db.state.suggestions[0].status).toBe(applyFirst ? "accepted" : "rejected");
    expect(h.db.state.variants[0].price).toBe(applyFirst ? 90 : 85);
  });
  it("two recommendations based on the same price cannot overwrite one another", async () => {
    h.db.state.suggestions.push({ ...h.db.state.suggestions[0], id: 2, recommendedPrice: 92 });
    const results = await Promise.allSettled([service.applyPrice(1), service.applyPrice(2)]);
    expect(results.filter(row => row.status === "fulfilled")).toHaveLength(1);
    expect(h.db.state.priceWrites).toBe(1);
    expect(h.db.state.effects).toHaveLength(1);
    expect(h.db.state.suggestions[1].status).toBe("pending");
  });
  it("dismissal resolves without touching the variant price", async () => {
    const result = await service.dismiss(1);
    expect(result.status).toBe("rejected");
    expect(h.db.state.priceWrites).toBe(0);
  });
  it("audit capture failure rolls back recommendation replacement", async () => {
    h.db.failEffect = true;
    await expect(repo.saveSuggestions([{ id: 2, variantId: 7, productName: "Fixture",
      sizeName: "Regular", currentPrice: 85, status: "pending" }], "fixture-product"))
      .rejects.toThrow("Injected effect failure");
    expect(h.db.state.suggestions[0].id).toBe(1);
    expect(h.db.state.effects).toHaveLength(0);
  });
  it("failed regeneration retains prior pending recommendations", async () => {
    h.db.failInsert = true;
    await expect(repo.saveSuggestions([{ id: 2, variantId: 7, productName: "Fixture", sizeName: "Regular", currentPrice: 85, status: "pending" }], "fixture-product")).rejects.toThrow("Injected insert failure");
    expect(h.db.state.suggestions).toHaveLength(1);
    expect(h.db.state.suggestions[0].id).toBe(1);
  });
  it("a price changed during generation rolls back pending replacement", async () => {
    await expect(repo.saveSuggestions([{ variantId: 7, productName: "Fixture", sizeName: "Regular", currentPrice: 80 }], "fixture-product"))
      .rejects.toMatchObject({ statusCode: 409 });
    expect(h.db.state.suggestions[0].id).toBe(1);
  });
});
