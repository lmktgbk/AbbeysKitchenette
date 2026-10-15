import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { isolatedPostgres } from "./helpers/isolatedPostgres.js";
const h = vi.hoisted(() => ({ db: null }));
vi.mock("../src/config/prisma.js", () => ({ default: new Proxy({}, { get: (_, key) => typeof h.db[key] === "function" ? h.db[key].bind(h.db) : h.db[key] }) }));
import { wasteReductionRepository as repo } from "../src/modules/wasteReduction/wasteReduction.repository.js";
import { wasteReductionService as service } from "../src/modules/wasteReduction/wasteReduction.service.js";
import { ingredientService } from "../src/modules/ingredients/ingredient.service.js";
import { ingredientRepository } from "../src/modules/ingredients/ingredient.repository.js";
import { orderRepository } from "../src/modules/orders/order.repository.js";
import { buildWasteInsights } from "../src/modules/wasteReduction/wasteReduction.analysis.js";
import { loadInventoryPlanningSnapshot } from "../src/services/inventoryPlanning.repository.js";
import { lockStock } from "../src/modules/ingredients/ingredient.lock.js";
import { buildReorderContexts } from "../src/modules/reorderSuggestions/reorderSuggestions.analysis.js";
let fixture, db, adminId, today;
const day = offset => new Date(Date.parse(today) + offset * 86400000);

describe.skipIf(process.env.WASTE_DB_CHECK !== "1")("Isolated Waste Insights actions", () => {
  beforeAll(async () => {
    fixture = await isolatedPostgres("waste_actions_check"); db = h.db = fixture.db;
    [{ today }] = await db.$queryRaw`SELECT (now() AT TIME ZONE 'Asia/Manila')::date::text AS today`;
    adminId = randomUUID();
    await db.user.create({ data: { id: adminId, name: "Fixture admin", email: "waste-fixture@invalid.example", role: "admin", passwordHash: "unused" } });
  }, 180000);
  afterAll(async () => { await fixture?.cleanup(); }, 30000);

  async function scenario() {
    const ingredientId = randomUUID();
    await db.ingredient.create({ data: { ingredientId, ingredientName: `Fixture ${ingredientId}`, unit: "g", minimumThreshold: 0 } });
    const batch = data => db.restockBatch.create({ data: { ingredientId, restockedById: adminId,
      quantityAdded: 100, quantityLeft: 100, costPerUnit: 0.5, totalCost: 50, ...data } });
    const expired = await batch({ expiryDate: day(-1), restockedAt: day(-5) });
    const fifo = await batch({ restockedAt: day(-4), isPriority: true });
    const soon = await batch({ expiryDate: day(1), restockedAt: day(-1) });
    const rows = buildWasteInsights(await loadInventoryPlanningSnapshot(db)).filter(r => r.ingredient_id === ingredientId);
    await repo.saveInsights(rows, undefined, adminId);
    const saved = await db.wasteReduction.findMany({ where: { ingredientId, status: "pending" } });
    return { ingredientId, expired, fifo, soon, expiredInsight: saved.find(r => r.metadata.kind === "expired_stock"), watchInsight: saved.find(r => r.metadata.kind === "expiry_watch") };
  }

  it("prioritizes an eligible batch atomically and order allocation falls back after depletion or expiry", async () => {
    const s = await scenario();
    await service.prioritize(s.watchInsight.id, s.soon.restockId, adminId);
    expect((await db.wasteReduction.findUnique({ where: { id: s.watchInsight.id } })).status).toBe("accepted");
    expect((await service.getPending()).some(r => r.id === s.watchInsight.id)).toBe(false);
    const batches = await db.restockBatch.findMany({ where: { ingredientId: s.ingredientId } });
    expect(batches.filter(b => b.isPriority).map(b => b.restockId)).toEqual([s.soon.restockId]);
    expect(batches.every(b => Number(b.quantityLeft) === 100)).toBe(true);
    expect((await orderRepository.getAllAvailableBatches([s.ingredientId], db)).get(s.ingredientId).map(b => b.restockId)).toEqual([s.soon.restockId, s.fifo.restockId]);
    await db.restockBatch.update({ where: { restockId: s.soon.restockId }, data: { expiryDate: day(-1) } });
    expect((await orderRepository.getAllAvailableBatches([s.ingredientId], db)).get(s.ingredientId).map(b => b.restockId)).toEqual([s.fifo.restockId]);
    await db.restockBatch.update({ where: { restockId: s.soon.restockId }, data: { quantityLeft: 0 } });
    await db.$transaction(async tx => { await lockStock(tx, [s.ingredientId]); await ingredientService.handleBatchDepletion(s.ingredientId, s.soon.restockId, tx); });
    expect(await ingredientRepository.findFifoLeaderId(s.ingredientId, db)).toBe(s.fifo.restockId);
    expect((await db.restockBatch.findUnique({ where: { restockId: s.fifo.restockId } })).isPriority).toBe(true);
  }, 30000);

  it("blocks stale insights and prevents selecting expired or depleted batches", async () => {
    const s = await scenario();
    await db.restockBatch.update({ where: { restockId: s.soon.restockId }, data: { quantityLeft: 99 } });
    await expect(service.prioritize(s.watchInsight.id, s.soon.restockId, adminId)).rejects.toMatchObject({ code: "STALE_WASTE_INSIGHT" });
    await expect(ingredientService.toggleBatchPriority(s.ingredientId, s.expired.restockId, true)).rejects.toMatchObject({ code: "BATCH_NOT_USABLE" });
    await db.restockBatch.update({ where: { restockId: s.soon.restockId }, data: { quantityLeft: 0 } });
    await expect(ingredientService.toggleBatchPriority(s.ingredientId, s.soon.restockId, true)).rejects.toMatchObject({ code: "BATCH_NOT_USABLE" });
    expect((await db.restockBatch.findUnique({ where: { restockId: s.fifo.restockId } })).isPriority).toBe(true);
  }, 30000);

  it("records one expired loss under competing requests, preserving other batches and costs", async () => {
    const s = await scenario();
    const results = await Promise.allSettled([
      service.expiredLoss(s.expiredInsight.id, s.expired.restockId, adminId),
      service.expiredLoss(s.expiredInsight.id, s.expired.restockId, adminId),
    ]);
    expect(results.filter(r => r.status === "fulfilled"), results.map(r => r.reason?.message)).toHaveLength(1);
    const losses = await db.lossRecord.findMany({ where: { relatedRestockId: s.expired.restockId } });
    expect(losses).toHaveLength(1);
    expect((await db.wasteReduction.findUnique({ where: { id: s.expiredInsight.id } })).status).toBe("accepted");
    expect((await service.getPending()).some(r => r.id === s.expiredInsight.id)).toBe(false);
    expect(Number(losses[0].quantityLost)).toBe(100);
    expect(Number(losses[0].totalCostLost)).toBe(50);
    expect((await db.restockBatch.findUnique({ where: { restockId: s.expired.restockId } })).quantityLeft.toNumber()).toBe(0);
    expect((await db.restockBatch.findUnique({ where: { restockId: s.fifo.restockId } })).quantityLeft.toNumber()).toBe(100);
    expect((await db.restockBatch.findUnique({ where: { restockId: s.soon.restockId } })).quantityLeft.toNumber()).toBe(100);
  }, 30000);

  it("rejects stale disposal, wrong batches, and resolved insights without writing losses", async () => {
    const s = await scenario();
    await expect(service.expiredLoss(s.expiredInsight.id, s.soon.restockId, adminId)).rejects.toMatchObject({ code: "BATCH_NOT_EXPIRED" });
    await db.restockBatch.update({ where: { restockId: s.expired.restockId }, data: { quantityLeft: 99 } });
    await expect(service.expiredLoss(s.expiredInsight.id, s.expired.restockId, adminId)).rejects.toMatchObject({ code: "STALE_WASTE_INSIGHT" });
    expect(await db.lossRecord.count({ where: { ingredientId: s.ingredientId } })).toBe(0);
    await db.wasteReduction.update({ where: { id: s.expiredInsight.id }, data: { status: "accepted" } });
    await expect(service.expiredLoss(s.expiredInsight.id, s.expired.restockId, adminId)).rejects.toMatchObject({ code: "WASTE_RESOLVED" });
  }, 30000);

  it("acknowledging an insight leaves stock and priorities unchanged", async () => {
    const s = await scenario();
    const before = await db.restockBatch.findMany({ where: { ingredientId: s.ingredientId }, orderBy: { restockId: "asc" } });
    await service.accept(s.watchInsight.id, adminId);
    expect(await db.restockBatch.findMany({ where: { ingredientId: s.ingredientId }, orderBy: { restockId: "asc" } })).toEqual(before);
  }, 30000);

  it("rolls back acknowledgment when the inventory operation fails", async () => {
    const s = await scenario();
    const failure = vi.spyOn(ingredientRepository, "createLossLog").mockRejectedValueOnce(new Error("Fixture write failure"));
    try {
      await expect(service.expiredLoss(s.expiredInsight.id, s.expired.restockId, adminId)).rejects.toThrow("Fixture write failure");
    } finally { failure.mockRestore(); }
    expect((await db.wasteReduction.findUnique({ where: { id: s.expiredInsight.id } })).status).toBe("pending");
    expect(Number((await db.restockBatch.findUnique({ where: { restockId: s.expired.restockId } })).quantityLeft)).toBe(100);
    expect(await db.lossRecord.count({ where: { ingredientId: s.ingredientId } })).toBe(0);
  }, 30000);

  async function deliveryScenario() {
    const s = await scenario();
    await db.ingredient.update({ where: { ingredientId: s.ingredientId }, data: { minimumThreshold: 500 } });
    const context = buildReorderContexts(await loadInventoryPlanningSnapshot(db)).find(c => c.ingredient_id === s.ingredientId);
    const advice = await db.reorderSuggestion.create({ data: { ingredientId: s.ingredientId, currentStock: context.usable_stock,
      unit: "g", suggestedQuantity: 300, urgency: "high", reasoning: "Fixture", confidence: 0.8, status: "pending",
      metadata: { ...context, policy_version: 2 } } });
    return { ...s, advice, delivery: { quantity_added: 300, cost_per_unit: 0.5, reorder_suggestion_id: advice.id } };
  }

  it("accepts a reorder only with its committed restock and blocks duplicate delivery", async () => {
    const s = await deliveryScenario();
    expect((await db.reorderSuggestion.findUnique({ where: { id: s.advice.id } })).status).toBe("pending");
    await ingredientService.restock(s.ingredientId, s.delivery, adminId);
    expect((await db.reorderSuggestion.findUnique({ where: { id: s.advice.id } })).status).toBe("accepted");
    expect(await db.restockBatch.count({ where: { ingredientId: s.ingredientId } })).toBe(4);
    await expect(ingredientService.restock(s.ingredientId, s.delivery, adminId)).rejects.toMatchObject({ code: "SUGGESTION_CONFLICT" });
    expect(await db.restockBatch.count({ where: { ingredientId: s.ingredientId } })).toBe(4);
  }, 30000);

  it("keeps reorder pending when restock fails and rejects stale evidence before adding stock", async () => {
    const s = await deliveryScenario();
    const failure = vi.spyOn(ingredientRepository, "createRestockBatch").mockRejectedValueOnce(new Error("Fixture delivery failure"));
    try { await expect(ingredientService.restock(s.ingredientId, s.delivery, adminId)).rejects.toThrow("Fixture delivery failure"); }
    finally { failure.mockRestore(); }
    expect((await db.reorderSuggestion.findUnique({ where: { id: s.advice.id } })).status).toBe("pending");
    expect(await db.restockBatch.count({ where: { ingredientId: s.ingredientId } })).toBe(3);
    await db.restockBatch.update({ where: { restockId: s.fifo.restockId }, data: { quantityLeft: 99 } });
    await expect(ingredientService.restock(s.ingredientId, s.delivery, adminId)).rejects.toMatchObject({ code: "STALE_REORDER_SUGGESTION" });
    expect((await db.reorderSuggestion.findUnique({ where: { id: s.advice.id } })).status).toBe("pending");
    expect(await db.restockBatch.count({ where: { ingredientId: s.ingredientId } })).toBe(3);
  }, 30000);
});
