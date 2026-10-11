import { beforeEach, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ tx: { $queryRawUnsafe: vi.fn() }, effects: vi.fn() }));
vi.mock("../src/config/prisma.js", () => ({ default: { $transaction: fn => fn(h.tx) } }));
vi.mock("../src/infrastructure/effects/effects.js", () => ({ recordEffects: h.effects, recordMutation: vi.fn() }));
import { ingredientService } from "../src/modules/ingredients/ingredient.service.js";
import { ingredientRepository as repo } from "../src/modules/ingredients/ingredient.repository.js";
import { recordCountSchema } from "../src/modules/ingredients/ingredient.validation.js";

// Exercise the business workflow without writing to the configured Supabase database.
beforeEach(() => {
  vi.restoreAllMocks(); h.effects.mockClear();
  vi.spyOn(repo, "findById").mockResolvedValue({ ingredientName: "Milk", unit: "ml", minimumThreshold: 0 });
  vi.spyOn(repo, "getStockFromBatches").mockResolvedValue(105);
  vi.spyOn(repo, "findActiveBatchesFifo").mockResolvedValue([
    { restockId: 1, quantityLeft: 5, costPerUnit: 2, version: 0 },
    { restockId: 2, quantityLeft: 100, costPerUnit: 3, version: 0 },
  ]);
  vi.spyOn(repo, "decrementBatchQuantity").mockResolvedValue({});
  vi.spyOn(repo, "createLossLog").mockResolvedValue({ lossId: 7 });
  vi.spyOn(repo, "createAdjustment").mockResolvedValue({});
  vi.spyOn(repo, "incrementBatchQuantity").mockResolvedValue({});
  vi.spyOn(repo, "findCountRestorationBatches").mockResolvedValue([{ restockId: 2, quantityAdded: 200, quantityLeft: 100, version: 3 }]);
  h.tx.$queryRawUnsafe.mockResolvedValue([{ day: "2026-10-11" }]);
});
it("cascades a 15 ml correction without recording a financial loss", async () => {
  const result = await ingredientService.recordCount("milk", { physical_quantity: 90, reason: "correction", notes: "Fixture stock correction" }, "admin");
  expect(repo.decrementBatchQuantity.mock.calls.map(call => call.slice(0, 2))).toEqual([[1, 5], [2, 10]]);
  expect(repo.createLossLog).not.toHaveBeenCalled();
  expect(result.loss_id).toBeNull();
});
it("keeps corrections out of financial loss records", async () => {
  await ingredientService.recordCount("milk", { physical_quantity: 90, reason: "correction", notes: "Duplicate initial count" }, "admin");
  expect(repo.createLossLog).not.toHaveBeenCalled();
  expect(repo.createAdjustment.mock.calls[0][0].notes).toContain("Duplicate initial count");
});
it("saves notes for unchanged counts without touching batches", async () => {
  const result = await ingredientService.recordCount("milk", { physical_quantity: 105, reason: "correction", notes: "Verified shelf" }, "admin");
  expect(result.outcome).toBe("balanced");
  expect(repo.createAdjustment.mock.calls[0][0]).toMatchObject({ quantityChanged: 0 });
  expect(repo.decrementBatchQuantity).not.toHaveBeenCalled();
  expect(h.effects).toHaveBeenCalled();
});
it("rejects overages when no non-expired batch has capacity", async () => {
  repo.findCountRestorationBatches.mockResolvedValue([]);
  await expect(ingredientService.recordCount("milk", { physical_quantity: 110, reason: "correction", notes: "Fixture stock correction" }, "admin")).rejects.toMatchObject({ code: "COUNT_RESTORATION_CAPACITY" });
  expect(repo.incrementBatchQuantity).not.toHaveBeenCalled();
  expect(repo.createAdjustment).not.toHaveBeenCalled();
});
it("requires an explanation only when the locked stock differs", async () => {
  await expect(ingredientService.recordCount("milk", { physical_quantity: 90 }, "admin")).rejects.toMatchObject({ code: "COUNT_EXPLANATION_REQUIRED" });
  expect(repo.decrementBatchQuantity).not.toHaveBeenCalled();
  expect(recordCountSchema.safeParse({ physical_quantity: 90, reason: "spoilage", notes: "Known spoilage" }).success).toBe(false);
  expect(recordCountSchema.safeParse({ physical_quantity: 105 }).success).toBe(true);
});

it("automatically restores found stock to the FIFO usable batch", async () => {
  await ingredientService.recordCount("milk", { physical_quantity: 110, reason: "correction", notes: "Fixture stock correction" }, "admin");
  expect(repo.findCountRestorationBatches).toHaveBeenCalledWith("milk", "2026-10-11", h.tx);
  expect(repo.incrementBatchQuantity).toHaveBeenCalledWith(2, 5, 3, h.tx);
  expect(repo.createAdjustment.mock.calls[0][0].relatedRestockId).toBe(2);
  expect(repo.createLossLog).not.toHaveBeenCalled();
});
it("includes depleted batches but excludes expired ones, ordered oldest first", async () => {
  repo.findCountRestorationBatches.mockRestore();
  const tx = { restockBatch: { findMany: vi.fn().mockResolvedValue([]) } };
  await repo.findCountRestorationBatches("milk", "2026-10-11", tx);
  expect(tx.restockBatch.findMany.mock.calls[0][0]).toMatchObject({
    where: { ingredientId: "milk", OR: [{ expiryDate: null }, { expiryDate: { gte: new Date("2026-10-11T00:00:00Z") } }] },
    orderBy: [{ restockedAt: "asc" }, { restockId: "asc" }],
  });
  expect(tx.restockBatch.findMany.mock.calls[0][0].where).not.toHaveProperty("quantityLeft");
});
it("fills batch A to 200 and restores the remaining 350 to B", async () => {
  repo.getStockFromBatches.mockResolvedValue(1000);
  repo.findCountRestorationBatches.mockResolvedValue([
    { restockId: 1, quantityAdded: 200, quantityLeft: 50, version: 1 },
    { restockId: 2, quantityAdded: 600, quantityLeft: 100, version: 2 },
  ]);
  await ingredientService.recordCount("milk", { physical_quantity: 1500, reason: "correction", notes: "Fixture stock correction" }, "admin");
  expect(repo.incrementBatchQuantity.mock.calls.map(c => c.slice(0, 3))).toEqual([[1, 150, 1], [2, 350, 2]]);
  expect(repo.createAdjustment.mock.calls[0][0].notes).toContain("Batch #1: +150 ml; Batch #2: +350 ml");
  expect(repo.createLossLog).not.toHaveBeenCalled();
});
it("checks total capacity before performing any writes", async () => {
  repo.findCountRestorationBatches.mockResolvedValue([{ restockId: 1, quantityAdded: 10, quantityLeft: 9, version: 0 }]);
  await expect(ingredientService.recordCount("milk", { physical_quantity: 110, reason: "correction", notes: "Fixture stock correction" }, "admin")).rejects.toMatchObject({ code: "COUNT_RESTORATION_CAPACITY" });
  expect(repo.incrementBatchQuantity).not.toHaveBeenCalled();
  expect(repo.createAdjustment).not.toHaveBeenCalled();
  expect(h.effects).not.toHaveBeenCalled();
});
it("restores depleted capacity while skipping full and previously overfilled batches", async () => {
  repo.findCountRestorationBatches.mockResolvedValue([
    { restockId: 1, quantityAdded: 10, quantityLeft: 11, version: 0 },
    { restockId: 2, quantityAdded: 10, quantityLeft: 10, version: 0 },
    { restockId: 3, quantityAdded: 10, quantityLeft: 0, version: 1 },
  ]);
  await ingredientService.recordCount("milk", { physical_quantity: 110, reason: "correction", notes: "Fixture stock correction" }, "admin");
  expect(repo.incrementBatchQuantity).toHaveBeenCalledExactlyOnceWith(3, 5, 1, h.tx);
});
it("does not create history or loss when allocation is insufficient", async () => {
  repo.findActiveBatchesFifo.mockResolvedValue([{ restockId: 1, quantityLeft: 5, costPerUnit: 2, version: 0 }]);
  await expect(ingredientService.recordCount("milk", { physical_quantity: 90, reason: "correction", notes: "Fixture stock correction" }, "admin")).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
  expect(repo.createAdjustment).not.toHaveBeenCalled();
  expect(repo.createLossLog).not.toHaveBeenCalled();
});
