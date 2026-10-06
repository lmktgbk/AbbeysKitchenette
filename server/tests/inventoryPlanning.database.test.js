import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { isolatedPostgres } from "./helpers/isolatedPostgres.js";
import { loadInventoryPlanningSnapshot } from "../src/services/inventoryPlanning.repository.js";
import { calculateReorders, calculateWaste } from "../src/services/inventoryPlanning.js";
const state = vi.hoisted(() => ({ db: null }));
vi.mock("../src/config/prisma.js", () => ({ default: new Proxy({}, { get: (_, key) => typeof state.db[key] === "function" ? state.db[key].bind(state.db) : state.db[key] }) }));
import { orderRepository } from "../src/modules/orders/order.repository.js";
import { ingredientService } from "../src/modules/ingredients/ingredient.service.js";
import { productRepository } from "../src/modules/products/product.repository.js";
let fixture, ingredientId, today, adminId;
describe.skipIf(process.env.INVENTORY_DB_CHECK !== "1")("Isolated inventory advice SQL and migration", () => {
  beforeAll(async () => {
    fixture = await isolatedPostgres("inventory_advice_check"); state.db = fixture.db;
    const db = fixture.db;
    [{ today }] = await db.$queryRaw`SELECT (now() AT TIME ZONE 'Asia/Manila')::date::text AS today`;
    adminId = randomUUID();
    await db.user.create({ data: { id: adminId, name: "Fixture", email: "fixture@advice.invalid", passwordHash: "fixture-only", role: "admin" } });
    ingredientId = randomUUID();
    await db.ingredient.create({ data: { ingredientId, ingredientName: "Fixture milk", unit: "ml", minimumThreshold: 50 } });
    await db.restockBatch.create({ data: { ingredientId, restockedById: adminId, quantityAdded: 500, quantityLeft: 500, costPerUnit: .1234,
      totalCost: 61.7, expiryDate: new Date(Date.parse(today)-86400000) } });
    await db.restockBatch.create({ data: { ingredientId, restockedById: adminId, quantityAdded: 50, quantityLeft: 50, costPerUnit: .1234,
      totalCost: 6.17, expiryDate: new Date(today) } });
    await db.stockAdjustment.create({ data: { ingredientId, adjustedById: adminId, adjustmentType: "deduction", quantityBefore: 100,
      quantityChanged: -10, quantityAfter: 90, adjustedAt: new Date(Date.parse(today)-2*86400000) } });
  }, 180000);
  afterAll(async () => { await fixture?.cleanup(); }, 30000);
  it("reads missing forecasts as unknown and positive daily consumption", async () => {
    const snapshot = await loadInventoryPlanningSnapshot(fixture.db);
    expect(snapshot.forecast).toBeNull();
    expect(snapshot.usage[0].total_14day).toBe(10);
    expect(snapshot.usage[0].daily_average).toBeCloseTo(10/14);
    expect(calculateReorders(snapshot)).toEqual([]);
    expect(calculateWaste(snapshot)[0].metadata.expired_quantity).toBe(500);
  });
  it("filters expired batches from allocation and availability", async () => {
    const available = await orderRepository.getAllAvailableBatches([ingredientId], fixture.db);
    expect(available.get(ingredientId)).toHaveLength(1);
    expect(await productRepository.getStockByIngredientIds([ingredientId], fixture.db)).toEqual({ [ingredientId]: 50 });
  });
  it("stores exact MBA evidence with the new migration", async () => {
    const job = await fixture.db.mBAJob.create({ data: { status: "completed", totalOrders: 125 } });
    const evidence = { version: 1, supporting_baskets: 20, training_baskets: 100, recent_baskets: 25, recent_supporting_baskets: 5 };
    const rule = await fixture.db.mBARule.create({ data: { jobId: job.id, productNameA: "A", productNameB: "B",
      support: .2, confidence: 1, lift: 5, evidence } });
    expect((await fixture.db.mBARule.findUnique({ where: { id: rule.id } })).evidence).toEqual(evidence);
  });
  it("loads dated recipe demand from a completed forecast", async () => {
    const db = fixture.db;
    const category = await db.category.create({ data: { categoryName: "Fixture" } });
    const sub = await db.subcategory.create({ data: { subcategoryName: "Fixture", categoryId: category.categoryId } });
    const product = await db.product.create({ data: { productName: "Fixture", subcategoryId: sub.subcategoryId } });
    const variant = await db.productVariant.create({ data: { productId: product.productId, sizeName: "Regular", price: 100 } });
    await db.recipe.create({ data: { variantId: variant.variantId, ingredientId, quantityNeeded: 10 } });
    const job = await db.forecastJob.create({ data: { status: "completed", period: 7, completedAt: new Date() } });
    const daily = Array.from({ length: 7 }, (_, i) => ({ date: new Date(Date.parse(today) + i*86400000).toISOString().slice(0,10), units: 1.5 }));
    await db.forecastResult.create({ data: { jobId: job.id, variantId: variant.variantId,
      productName: "Fixture", sizeName: "Regular", price: 100, categoryId: category.categoryId, dailyData: daily } });
    const snapshot = await loadInventoryPlanningSnapshot(db);
    const [advice] = calculateReorders(snapshot);
    expect(advice.metadata.source).toBe("forecast");
    expect(advice.metadata.expected_demand).toBe(105);
    expect(advice.suggested_quantity).toBe(150); // today's stock covers only 15 ml before expiry
  });
  it("records expired disposal once, atomically, under competing requests", async () => {
    const expired = await fixture.db.restockBatch.findFirst({ where: { ingredientId, quantityLeft: 500 } });
    const outcomes = await Promise.allSettled([
      ingredientService.declareExpiredLoss(ingredientId, expired.restockId, adminId),
      ingredientService.declareExpiredLoss(ingredientId, expired.restockId, adminId),
    ]);
    expect(outcomes.filter(r => r.status === "fulfilled"), outcomes.map(r => r.reason?.message)).toHaveLength(1);
    expect(Number((await fixture.db.restockBatch.findUnique({ where: { restockId: expired.restockId } })).quantityLeft)).toBe(0);
    expect(await fixture.db.lossRecord.count({ where: { relatedRestockId: expired.restockId } })).toBe(1);
    expect(await fixture.db.stockAdjustment.count({ where: { ingredientId, adjustmentType: "loss" } })).toBe(1);
    const usable = await fixture.db.restockBatch.findFirst({ where: { ingredientId, quantityLeft: 50 } });
    await expect(ingredientService.declareExpiredLoss(ingredientId, usable.restockId, adminId)).rejects.toMatchObject({ code: "BATCH_NOT_EXPIRED" });
  });

});
