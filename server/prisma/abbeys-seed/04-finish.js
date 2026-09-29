import "dotenv/config";
import { PrismaClient } from "../../src/generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import crypto from "crypto";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }

async function main() {
  const t0 = Date.now();
  console.log("Phase 3b: stock sync + losses + manifest...");

  // 1. Recompute quantityLeft = added - deducted (pure SQL, set-based)
  console.log("  syncing quantity_left from deductions...");
  const r = await prisma.$executeRawUnsafe(`
    UPDATE restock_batches rb
    SET quantity_left = GREATEST(0, rb.quantity_added - COALESCE(d.used, 0))
    FROM (SELECT restock_batch_id AS id, SUM(quantity_deducted) AS used
          FROM order_ingredient_deductions GROUP BY restock_batch_id) d
    WHERE rb.restock_id = d.id`);
  console.log(`  ✓ ${r} batch rows synced`);

  // 2. Monthly losses (21 months)
  const users = await prisma.user.findMany({ select: { id: true, role: true } });
  const staff = users.filter((u) => u.role === "kitchen" || u.role === "admin").map((u) => u.id);
  const ings = await prisma.ingredient.findMany({ select: { ingredientId: true } });
  const costs = new Map();
  const firstBatches = await prisma.restockBatch.findMany({
    where: { supplierName: "Abbey's Opening Stock" },
    select: { ingredientId: true, costPerUnit: true },
  });
  for (const b of firstBatches) costs.set(b.ingredientId, Number(b.costPerUnit));
  const existingLosses = await prisma.lossRecord.count();
  if (existingLosses > 0) {
    console.log(`  — losses already seeded (${existingLosses}), skipping`);
  } else {
  const losses = [];
  const mStart = new Date("2025-01-01T00:00:00+08:00");
  for (let m = 0; m < 21; m++) {
    for (let j = 0, k = randInt(3, 5); j < k; j++) {
      const ing = pick(ings).ingredientId;
      const q = randInt(5, 60);
      const c = costs.get(ing) ?? 0.1;
      losses.push({
        ingredientId: ing, declaredById: pick(staff),
        lossType: pick(["spoilage", "spillage", "expiry", "other"]),
        quantityLost: q, costPerUnit: c, totalCostLost: Math.round(q * c * 100) / 100,
        notes: "Seeded loss", loggedAt: addDays(mStart, m * 30 + randInt(1, 28)),
      });
    }
  }
  for (let i = 0; i < losses.length; i += 2000) {
    await prisma.lossRecord.createMany({ data: losses.slice(i, i + 2000), skipDuplicates: true });
  }
  console.log(`  ✓ ${losses.length} loss records`);
  } // end losses guard

  // 3. Real-slip manifest: match REAL slips by date+table+lines+EXACT total.
  // Slip totals recomputed from menu prices (DB variant prices).
  const { REAL } = await import("./03-orders.js");
  const variants = await prisma.productVariant.findMany({
    include: { product: { select: { productName: true } } },
  });
  const priceOf = new Map(variants.map((v) => [`${v.product.productName}||${v.sizeName}`, Number(v.price)]));
  console.log("\n── Real-slip manifest ──");
  let exact = 0;
  for (let idx = 0; idx < REAL.length; idx++) {
    const [date, table, , , items] = REAL[idx];
    const expected = items.reduce((s, [q, pn, sz]) => s + Math.round(priceOf.get(`${pn}||${sz}`) * q * 100) / 100, 0);
    const cands = await prisma.order.findMany({
      where: { orderDate: new Date(date + "T00:00:00Z"), tableNumber: table, status: "completed" },
      include: { items: true },
    });
    const hits = cands.filter((o) => o.items.length === items.length && Number(o.totalAmount) === expected);
    if (hits.length) {
      exact++;
      console.log(`  slip#${idx + 1} ${date} ${table} -> order ${hits[0].orderNumber} (${hits[0].items.length} lines, P${Number(hits[0].totalAmount)}) EXACT`);
    } else {
      const near = cands.filter((o) => o.items.length === items.length).slice(0, 3)
        .map((o) => `${o.orderNumber}/P${Number(o.totalAmount)}`).join(", ");
      console.log(`  slip#${idx + 1} ${date} ${table} -> NO EXACT (expect P${expected}; same-line-count: ${near || "none"})`);
    }
  }
  console.log(`  ${exact}/${REAL.length} exact matches`);
  console.log(`\nDone in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main()
  .catch((e) => { console.error("Finish failed:", e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
