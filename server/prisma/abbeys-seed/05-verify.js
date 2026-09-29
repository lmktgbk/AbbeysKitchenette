import "dotenv/config";
import { PrismaClient } from "../../src/generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("── VERIFICATION ──\n");

  // 1. Kept tables
  console.log("kept:", {
    users: await prisma.user.count(),
    settings: await prisma.systemSettings.count(),
    categories: await prisma.category.count(),
  });

  // 2. Catalog counts
  const [subs, ings, prods, vars, recs, batches] = await Promise.all([
    prisma.subcategory.count(), prisma.ingredient.count(), prisma.product.count(),
    prisma.productVariant.count(), prisma.recipe.count(), prisma.restockBatch.count(),
  ]);
  console.log("catalog:", { subs, ings, prods, vars, recs, batches });

  // every variant has >=1 recipe?
  const bare = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*)::int AS n FROM product_variants pv
    LEFT JOIN recipes r ON r.variant_id = pv.variant_id
    WHERE r.recipe_id IS NULL`);
  console.log("variants without recipes:", bare[0].n);

  // 3. Orders
  const [orders, completed, cancelled, items, counters, receipts, cancels] = await Promise.all([
    prisma.order.count(),
    prisma.order.count({ where: { status: "completed" } }),
    prisma.order.count({ where: { status: "cancelled" } }),
    prisma.orderItem.count(), prisma.orderCounter.count(),
    prisma.receipt.count(), prisma.orderCancellation.count(),
  ]);
  console.log("orders:", { orders, completed, cancelled, items, counters, receipts, cancels });
  console.log("cancel rate:", (cancelled / orders * 100).toFixed(2) + "% (target 2%)");

  // 4. Balances: subtotal == total, items roll up
  const badTotals = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*)::int AS n FROM orders WHERE subtotal_amount <> total_amount OR discount_type <> 'none'`);
  console.log("orders with bad totals/discounts:", badTotals[0].n);
  const badRollup = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*)::int AS n FROM (
      SELECT o.order_id, o.total_amount, COALESCE(SUM(oi.subtotal),0) AS s
      FROM orders o LEFT JOIN order_items oi ON oi.order_id = o.order_id
      GROUP BY o.order_id, o.total_amount) t WHERE ABS(t.total_amount - t.s) > 0.01`);
  console.log("orders where items don't roll up:", badRollup[0].n);

  // 5. Date coverage + hours
  const range = await prisma.$queryRawUnsafe(`
    SELECT MIN(order_date)::text AS min, MAX(order_date)::text AS max,
           COUNT(DISTINCT order_date)::int AS days FROM orders`);
  console.log("date range:", range[0]);
  const gaps = await prisma.$queryRawUnsafe(`
    WITH days AS (SELECT generate_series(MIN(order_date), MAX(order_date), '1 day')::date AS d FROM orders)
    SELECT COUNT(*)::int AS n FROM days LEFT JOIN (SELECT DISTINCT order_date FROM orders) o ON o.order_date = days.d
    WHERE o.order_date IS NULL`);
  console.log("days with zero orders:", gaps[0].n);
  const hours = await prisma.$queryRawUnsafe(`
    SELECT EXTRACT(HOUR FROM created_at AT TIME ZONE 'Asia/Manila')::int AS h, COUNT(*)::int AS n
    FROM orders GROUP BY h ORDER BY h`);
  console.log("orders by hour (PHT):", hours.map((r) => `${r.h}:${r.n}`).join(" "));
  const outOfHours = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*)::int AS n FROM orders
    WHERE EXTRACT(HOUR FROM created_at AT TIME ZONE 'Asia/Manila') < 16`);
  console.log("orders before 16:00 PHT:", outOfHours[0].n);

  // 6. Payments
  const pays = await prisma.$queryRawUnsafe(`SELECT payment_method, COUNT(*)::int AS n FROM orders GROUP BY 1`);
  console.log("payments:", pays);
  const noRef = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS n FROM orders WHERE payment_method <> 'cash' AND reference_no IS NULL`);
  console.log("non-cash missing ref:", noRef[0].n);

  // 7. Stock integrity
  const neg = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS n FROM restock_batches WHERE quantity_left < 0`);
  console.log("batches with negative left:", neg[0].n);
  const [deducts, adjs, losses] = await Promise.all([
    prisma.orderIngredientDeduction.count(), prisma.stockAdjustment.count(), prisma.lossRecord.count(),
  ]);
  console.log("ledger:", { deducts, adjs, losses });

  // 8. ML readiness: variant days-of-data distribution
  const cov = await prisma.$queryRawUnsafe(`
    SELECT v.variant_id, COUNT(DISTINCT o.order_date)::int AS days
    FROM order_items oi JOIN orders o ON o.order_id = oi.order_id
    JOIN product_variants v ON v.variant_id = oi.variant_id
    WHERE o.status = 'completed'
    GROUP BY v.variant_id`);
  const buckets = { "<7": 0, "7-29": 0, "30-99": 0, "100+": 0 };
  for (const r of cov) {
    if (r.days < 7) buckets["<7"]++;
    else if (r.days < 30) buckets["7-29"]++;
    else if (r.days < 100) buckets["30-99"]++;
    else buckets["100+"]++;
  }
  console.log(`variants with sales: ${cov.length}/${vars}`, "days-of-data:", buckets);
  const multi = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS n FROM orders WHERE status='completed' AND order_id IN (SELECT order_id FROM order_items GROUP BY order_id HAVING COUNT(*) > 1)`);
  console.log("multi-item completed orders (MBA fuel):", multi[0].n);

  // 9. Store hours
  const s = await prisma.systemSettings.findUnique({ where: { id: 1 } });
  console.log("store hours:", JSON.stringify(s.storeHours).slice(0, 200));

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
