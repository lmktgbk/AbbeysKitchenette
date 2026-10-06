import { readFile } from "node:fs/promises";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { isolatedPostgres } from "./helpers/isolatedPostgres.js";
import { initialize, loadCatalog, writeDay, closingStock } from "../prisma/demo/write.js";
import { ingredients } from "../prisma/demo/catalog.js";
import { seedId, planDay, marker } from "../prisma/demo/plan.js";

let fixture, db, catalog;
describe.skipIf(process.env.DEMO_DB_CHECK !== "1")("Isolated PostgreSQL demo seed", () => {
  beforeAll(async () => {
    fixture = await isolatedPostgres("demo_seed_check"); db = fixture.db;
    const schema = await readFile("prisma/schema.prisma", "utf8");
    const tables = [...schema.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)\n\}/g)].map((m) => m[2].match(/@@map\("([a-z_][a-z0-9_]*)"\)/)?.[1] ?? m[1]);
    await initialize(db, tables, "admin@fixture.invalid", "fixture-password-only", fixture.schema);
    catalog = await loadCatalog(db);
  }, 180000);
  afterAll(async () => { await fixture?.cleanup(); }, 30000);

  it("records receipt samples, money, item-linked deductions and FIFO balances", async () => {
    expect(await writeDay(db, "2026-09-20", catalog)).toBe(true);
    const orders = await db.order.findMany({ include: { items: true, receipt: true } });
    expect(orders).toHaveLength(planDay("2026-09-20").length);
    expect(orders.filter((o) => o.customerName.startsWith("Receipt sample"))).toHaveLength(18);
    for (const order of orders) {
      expect(Number(order.totalAmount)).toBe(order.items.reduce((sum, i) => sum + i.quantity * Number(i.unitPrice), 0));
      expect(order.receipt).not.toBeNull();
    }
    const rows = await db.$queryRaw`SELECT b.restock_id FROM restock_batches b LEFT JOIN order_ingredient_deductions d ON d.restock_batch_id=b.restock_id
      GROUP BY b.restock_id HAVING b.quantity_added - COALESCE(SUM(d.quantity_deducted),0) <> b.quantity_left`;
    expect(rows).toEqual([]);
    const items = await db.orderItem.findMany({ include: { variant: { include: { recipes: true } }, deductions: true } });
    for (const item of items) for (const recipe of item.variant.recipes) {
      const used = item.deductions.filter((d) => d.ingredientId === recipe.ingredientId).reduce((sum, d) => sum + Number(d.quantityDeducted), 0);
      expect(used).toBeCloseTo(Number(recipe.quantityNeeded) * item.quantity, 3);
    }
  }, 120000);

  it("leaves one positive batch and extends without duplicate days", async () => {
    await closingStock(db, "2026-09-20");
    expect(await db.restockBatch.count({ where: { quantityLeft: { gt: 0 } } })).toBe(ingredients.length);
    const count = await db.order.count();
    expect(await writeDay(db, "2026-09-20", catalog)).toBe(false);
    expect(await db.order.count()).toBe(count);
    expect(await writeDay(db, "2026-09-21", catalog)).toBe(true);
    await closingStock(db, "2026-09-21");
    const duplicates = await db.$queryRaw`SELECT ingredient_id FROM restock_batches WHERE quantity_left>0 GROUP BY ingredient_id HAVING COUNT(*)<>1`;
    expect(duplicates).toEqual([]);
    expect(await db.restockBatch.count({ where: { quantityLeft: { gt: 0 } } })).toBe(ingredients.length);
  }, 120000);

  it("rolls back an interrupted day and rejects changed checkpoints", async () => {
    const broken = new Map(catalog); broken.clear();
    await expect(writeDay(db, "2026-09-22", broken)).rejects.toThrow();
    expect(await db.shift.findUnique({ where: { shiftId: seedId("shift:2026-09-22") } })).toBeNull();
    expect(await db.order.count({ where: { orderDate: new Date("2026-09-22") } })).toBe(0);
    await db.shift.update({ where: { shiftId: seedId("shift:2026-09-21") }, data: { closeNote: `${marker}:changed` } });
    await expect(writeDay(db, "2026-09-21", catalog)).rejects.toThrow("definition changed");
  }, 120000);

  it("records expired stock as losses and preserves an unrelated manual order", async () => {
    const manual = await db.order.create({ data: { customerName: "Manual test order", tableNumber: "Table 1", orderNumber: 999,
      orderDate: new Date("2026-09-30"), orderSource: "walk_in", status: "pending", createdBy: seedId("admin") } });
    await writeDay(db, "2026-09-30", catalog);
    await closingStock(db, "2026-09-30");
    expect((await db.order.findUnique({ where: { orderId: manual.orderId } })).customerName).toBe("Manual test order");
    expect((await db.orderCounter.findUnique({ where: { date: new Date("2026-09-30") } })).counter).toBeGreaterThan(999);
    expect(await db.lossRecord.count({ where: { lossType: "expiry" } })).toBeGreaterThan(0);
    const discrepancies = await db.$queryRaw`SELECT b.restock_id FROM restock_batches b
      LEFT JOIN (SELECT restock_batch_id, SUM(quantity_deducted) used FROM order_ingredient_deductions GROUP BY restock_batch_id) d ON d.restock_batch_id=b.restock_id
      LEFT JOIN (SELECT related_restock_id, SUM(quantity_lost) lost FROM loss_records GROUP BY related_restock_id) l ON l.related_restock_id=b.restock_id
      WHERE b.quantity_added - COALESCE(d.used,0) - COALESCE(l.lost,0) <> b.quantity_left`;
    expect(discrepancies).toEqual([]);
    const brokenAdjustments = await db.$queryRaw`SELECT adjustment_id FROM stock_adjustments WHERE quantity_before + quantity_changed <> quantity_after OR quantity_after < 0`;
    expect(brokenAdjustments).toEqual([]);
    expect(await db.restockBatch.count({ where: { quantityLeft: { gt: 0 } } })).toBe(ingredients.length);
  }, 120000);
});
