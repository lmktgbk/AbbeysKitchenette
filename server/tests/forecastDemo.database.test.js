import { readFile } from "node:fs/promises";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { isolatedPostgres } from "./helpers/isolatedPostgres.js";
import { initialize, loadCatalog, writeDay, closingStock } from "../prisma/demo/write.js";
import { forecastSeed, forecastDemoDay } from "../prisma/demo/forecast-plan.js";
let fixture, db, catalog;
describe.skipIf(process.env.DEMO_DB_CHECK !== "1")("Forecast profile PostgreSQL seed", () => {
  beforeAll(async () => {
    fixture=await isolatedPostgres("forecast_seed_check");db=fixture.db;
    const schema=await readFile("prisma/schema.prisma","utf8");
    const tables=[...schema.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)\n\}/g)].map((m)=>m[2].match(/@@map\("([a-z_][a-z0-9_]*)"\)/)?.[1]??m[1]);
    await initialize(db,tables,"admin@fixture.invalid","fixture-password-only",fixture.schema);
    catalog=await loadCatalog(db);
  },180000);
  afterAll(async()=>{await fixture?.cleanup();},30000);
  it("publishes approved baskets, receipts, money and item-linked stock",async()=>{
    await writeDay(db,"2026-09-20",catalog,forecastSeed);
    const orders=await db.order.findMany({include:{items:true,receipt:true}});
    expect(orders).toHaveLength(forecastDemoDay("2026-09-20").length);
    expect(orders.filter((o)=>o.customerName.startsWith("Receipt sample"))).toHaveLength(18);
    for(const order of orders){
      expect(Number(order.totalAmount)).toBe(order.items.reduce((s,i)=>s+i.quantity*Number(i.unitPrice),0));
      expect(order.receipt).not.toBeNull();
    }
    const items=await db.orderItem.findMany({include:{variant:{include:{recipes:true}},deductions:true}});
    for(const item of items)for(const recipe of item.variant.recipes){
      const used=item.deductions.filter((d)=>d.ingredientId===recipe.ingredientId).reduce((s,d)=>s+Number(d.quantityDeducted),0);
      expect(used).toBeCloseTo(Number(recipe.quantityNeeded)*item.quantity,3);
    }
    await expect(writeDay(db,"2026-09-20",catalog)).rejects.toThrow("definition changed");
    expect(await writeDay(db,"2026-09-20",catalog,forecastSeed)).toBe(false);
    await closingStock(db,"2026-09-20",forecastSeed);
    expect(await db.restockBatch.count({where:{quantityLeft:{gt:0}}})).toBe(145);
    const broken=await db.$queryRaw`SELECT b.restock_id FROM restock_batches b LEFT JOIN order_ingredient_deductions d ON d.restock_batch_id=b.restock_id GROUP BY b.restock_id HAVING b.quantity_added-COALESCE(SUM(d.quantity_deducted),0)<>b.quantity_left`;
    expect(broken).toEqual([]);
    const shift=await db.shift.findFirst();expect(shift.closeNote).toBe(forecastSeed.marker);
    expect(Number(shift.expectedCash)).toBe(Number(shift.actualCash));
  },120000);
});
