import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from "vitest";
const h = vi.hoisted(() => ({ db: null }));
vi.mock("../src/config/prisma.js", () => ({ default: new Proxy({}, { get: (_target, key) => typeof h.db[key] === "function" ? h.db[key].bind(h.db) : h.db[key] }) }));
vi.mock("../src/config/env.js", () => ({ env: {} }));
vi.mock("../src/modules/priceOptimization/priceOptimization.prompts.js", () => ({ generatePriceSuggestions: vi.fn(), getCompetitorAverage: () => 75 }));
import { isolatedPostgres } from "./helpers/isolatedPostgres.js";
import repo from "../src/modules/priceOptimization/priceOptimization.repository.js";
import service from "../src/modules/priceOptimization/priceOptimization.service.js";
import { normalizeRecommendations } from "../src/modules/priceOptimization/priceOptimization.output.js";
let fixture, db, product, variant, rows;
describe.skipIf(process.env.PRICE_DB_CHECK !== "1")("PostgreSQL recommendation publication", () => {
  beforeAll(async () => { fixture = await isolatedPostgres("price_check"); db = h.db = fixture.db; }, 90000);
  afterAll(async () => { await fixture?.cleanup(); }, 30000);
  beforeEach(async () => {
    await db.product.deleteMany(); await db.subcategory.deleteMany(); await db.category.deleteMany();
    const category = await db.category.create({ data: { categoryName: "Fixture" } });
    const sub = await db.subcategory.create({ data: { categoryId: category.categoryId, subcategoryName: "Fixture" } });
    product = await db.product.create({ data: { subcategoryId: sub.subcategoryId, productName: "Coffee" } });
    variant = await db.productVariant.create({ data: { productId: product.productId, sizeName: "Regular", price: 85 } });
    rows = normalizeRecommendations({ recommendations: [{ variant_id: variant.variantId, recommended_price: 95, confidence: 0.8, reasoning: "Fixture pricing" }] }, await repo.getVariantPricingContext(product.productId));
    await repo.saveSuggestions(rows, product.productId);
  });
  it("persists authoritative context through the actual SQL queries", async () => {
    const [saved] = await db.priceOptimization.findMany();
    expect(saved.productName).toBe("Coffee"); expect(Number(saved.currentPrice)).toBe(85);
    expect(await repo.getRecipeDetails(product.productId)).toEqual([]);
  });
  it("rolls back replacement when the price has changed", async () => {
    const before = await db.priceOptimization.findMany();
    await db.productVariant.update({ where: { variantId: variant.variantId }, data: { price: 90 } });
    await expect(repo.saveSuggestions(rows, product.productId)).rejects.toMatchObject({ statusCode: 409 });
    expect(await db.priceOptimization.findMany()).toEqual(before);
  });
  it("rejects foreign variants without deleting pending rows", async () => {
    await expect(repo.saveSuggestions([{ ...rows[0], variantId: variant.variantId + 100 }], product.productId)).rejects.toMatchObject({ statusCode: 409 });
    expect(await db.priceOptimization.count()).toBe(1);
  });
  it("serializes simultaneous replacement without mixed batches", async () => {
    await Promise.all([repo.saveSuggestions(rows, product.productId), repo.saveSuggestions([{ ...rows[0], recommendedPrice: 100 }], product.productId)]);
    expect(await db.priceOptimization.count()).toBe(1);
  });
  it("rolls back deletion on an actual database insertion failure", async () => {
    const before = await db.priceOptimization.findMany();
    await expect(repo.saveSuggestions([{ ...rows[0], reasoning: null }], product.productId)).rejects.toThrow();
    expect(await db.priceOptimization.findMany()).toEqual(before);
  });
  it("racing approval against generation cannot publish an obsolete current price", async () => {
    const old = await db.priceOptimization.findFirst();
    const results = await Promise.allSettled([service.applyPrice(old.id), repo.saveSuggestions(rows, product.productId)]);
    for (const result of results) if (result.status === "rejected") expect([404, 409]).toContain(result.reason.statusCode);
    const price = Number((await db.productVariant.findUnique({ where: { variantId: variant.variantId } })).price);
    const saved = await db.priceOptimization.findMany();
    if (price === 95) {
      expect(saved.some(row => row.status === "accepted")).toBe(true);
      expect(saved.filter(row => row.status === "pending")).toHaveLength(0);
    } else {
      expect(price).toBe(85); expect(saved).toHaveLength(1); expect(saved[0].status).toBe("pending");
    }
  });
});
