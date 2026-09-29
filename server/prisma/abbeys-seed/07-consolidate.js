import "dotenv/config";
import { PrismaClient } from "../../src/generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const ADMIN_ID = "8b61ffe2-0ff4-43ed-8878-8a4fda1ec086";

// [name, shelfDays, fallbackQty(2wk parcel if leftover is 0)]
const SHELF = [
  ["Fresh Milk", 7, 20000], ["Whipping Cream", 14, 3000], ["Coffee Beans (Arabica, Roasted)", 180, 3000],
  ["DaVinci Gourmet Caramel Syrup", 365, 1000], ["DaVinci Gourmet Hazelnut Syrup", 365, 750],
  ["DaVinci Gourmet French Vanilla Syrup", 365, 1000], ["Easy White Chocolate Powder", 365, 2000],
  ["Easy Butterscotch Powder", 365, 1000], ["Easy Vanilla Powder", 365, 1000],
  ["Easy Salted Caramel Powder", 365, 1500], ["Condensed Milk", 180, 3900], ["Pure Honey", 730, 1000],
  ["Lotus Biscoff Spread", 180, 1200], ["Strawberry Fruit Syrup", 365, 1500],
  ["Blueberry Fruit Syrup", 365, 1500], ["Mango Fruit Syrup", 365, 1500], ["Lychee Fruit Syrup", 365, 1000],
  ["Green Apple Fruit Syrup", 365, 1000], ["Kiwi Fruit Syrup", 365, 1000], ["Passion Fruit Syrup", 365, 1000],
  ["Allmytea Tea Base", 30, 3000], ["Sprite (Fountain)", 180, 20000], ["Tube Ice", 7, 60000],
  ["Purified Water", 30, 40000], ["Strawberry Popping Boba", 180, 2000], ["Blueberry Popping Boba", 180, 2000],
  ["Mango Popping Boba", 180, 2000], ["Lychee Popping Boba", 180, 1500], ["Green Apple Popping Boba", 180, 1500],
  ["Coconut Jelly (Nata)", 180, 2000], ["Red Onion (Sibuyas)", 14, 5000], ["Garlic (Bawang)", 21, 3000],
  ["Cabbage (Repolyo)", 7, 5000], ["Carrots", 14, 4000], ["Bok Choy (Petchay)", 4, 3000],
  ["Cucumber (Pipino)", 7, 3000], ["Tomato (Kamatis)", 5, 4000], ["White Radish (Labanos)", 7, 2000],
  ["Orange (Fresh)", 14, 30], ["Lemon (Fresh)", 14, 30], ["Calamansi", 7, 2000], ["Bell Pepper", 7, 2000],
  ["Mixed Vegetables Small (Frozen)", 90, 2500], ["Mixed Vegetables Big (Frozen)", 90, 5000],
  ["Lettuce", 4, 3000], ["Ham", 90, 3000], ["Bacon", 90, 2000], ["Chicken Egg", 21, 120],
  ["Sausage", 90, 3000], ["Corned Beef", 180, 2000], ["Beef Strips", 120, 3000], ["Ground Pork", 90, 5000],
  ["Ground Beef", 90, 4000], ["Crab Sticks", 120, 2000], ["Tuna", 120, 3000],
  ["Chicken Breast Fillet", 90, 8000], ["Chicken Katsu (Frozen)", 90, 5000], ["Chicken Leg Quarter", 90, 60],
  ["Pork Liempo (Belly)", 90, 8000], ["Pork Chop", 90, 8000], ["Pork Jowls", 90, 6000],
  ["Pork Kasim (Shoulder)", 90, 6000], ["Fish (Bangus/Tilapia)", 90, 6000], ["Pork Butterfly Cut", 90, 5000],
  ["Toyomansi Marinated Meat", 30, 4000], ["Chicken BBQ (Marinated)", 30, 6000], ["Beef Tapa", 30, 4000],
  ["Pork Tocino", 30, 4000], ["Kani Sauce", 90, 1500], ["Caesar Dressing", 90, 1500],
  ["Cilantro Lime Dressing", 60, 1000], ["Sandwich Spread", 90, 2000], ["Spaghetti Sauce", 180, 4000],
  ["Pesto Sauce", 90, 1500], ["Gravy Sauce", 60, 2000], ["Cheese Sauce (Ready)", 60, 2000],
  ["Kare-Kare Sauce", 60, 2000], ["Katsu Sauce", 120, 1500], ["Shrimp Paste (Alamang)", 120, 1500],
  ["Evaporated Milk", 180, 3000], ["All-Purpose Cream", 180, 2000], ["Sinigang Mix", 365, 1000],
  ["Kare-Kare Mix", 365, 800], ["Truffle Sauce", 180, 500], ["Canned Mushroom", 365, 1500],
  ["Taco Powder", 365, 800], ["BBQ Powder", 365, 800], ["Cheese Powder", 365, 1500],
  ["Sour Cream Powder", 365, 800], ["Cheese Sauce Powder", 365, 1000], ["Chicken Broth Cubes", 365, 40],
  ["Beef Broth Cubes", 365, 40], ["Pancake Mix", 365, 2000], ["Banana Ketchup", 365, 2000],
  ["Mayonnaise", 120, 2000], ["Knorr Liquid Seasoning", 365, 1000], ["Soy Sauce (Toyo)", 365, 3000],
  ["Vinegar (Suka)", 365, 3000], ["Cooking Oil", 365, 8000], ["Salt (Asin)", 730, 2000],
  ["MSG (Vetsin)", 730, 1000], ["Ground Black Pepper (Paminta)", 730, 500], ["Sugar (Asukal)", 730, 5000],
  ["Oyster Sauce", 365, 1500], ["Sesame Oil", 365, 500], ["UFC Tomato Ketchup", 365, 2000],
  ["Parmesan Cheese", 180, 800], ["Orange Juice", 90, 2000], ["Pineapple Tidbits", 365, 1500],
  ["Hash Brown (Frozen)", 120, 2500], ["All-Purpose Flour (Harina)", 365, 5000], ["Kimchi", 30, 1500],
  ["Sliced Cheese", 90, 60], ["Butter", 90, 2000], ["Mustard", 365, 800],
  ["Red Hotdog Loaf", 4, 100], ["Green Hotdog Loaf", 4, 100], ["Baguette", 3, 40], ["Burger Buns", 4, 120],
  ["Linguine (Dry)", 730, 4000], ["Penne (Dry)", 730, 4000], ["Spaghetti Pasta (Dry)", 730, 5000],
  ["Macaroni (Dry)", 730, 3000], ["Pancit Noodles (Dry)", 730, 4000],
  ["Plain Rice (Uncooked)", 180, 30000], ["Matcha Powder", 365, 1500], ["Yakult (Probiotic Drink)", 21, 9600],
  ["Coca-Cola 1.5L Bottle", 180, 24], ["Royal 1.5L Bottle", 180, 12], ["Mountain Dew 1.5L Bottle", 180, 12],
  ["Coke in Can 320ml", 180, 48], ["Sprite 1.5L Bottle", 180, 24], ["Pineapple Juice (RTD)", 90, 6000],
  ["Cocoa Powder (Dark Chocolate)", 365, 2500], ["Ube Powder", 365, 800], ["Red Velvet Powder", 365, 800],
  ["Cookies & Cream Powder", 365, 1000], ["Cream Cheese", 60, 1500], ["Squid (Calamares)", 90, 4000],
  ["Shrimp (Hipon)", 90, 4000], ["Nacho Chips", 120, 2500], ["Chicken Feet and Neck", 90, 4000],
  ["Miso Paste", 180, 800],
];

async function main() {
  console.log("Consolidating to 1 active batch per ingredient...");
  const now = new Date();
  const manila = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Manila" }));
  const todayUTC = new Date(Date.UTC(manila.getFullYear(), manila.getMonth(), manila.getDate()));

  const ings = await prisma.ingredient.findMany({ select: { ingredientId: true, ingredientName: true } });
  const shelf = new Map(SHELF.map(([n, s, q]) => [n, { s, q }]));

  // Snapshot totals before
  const before = await prisma.$queryRawUnsafe(
    `SELECT ingredient_id AS id, COALESCE(SUM(quantity_left),0)::float AS t FROM restock_batches GROUP BY ingredient_id`);

  const rows = [];
  let zeroed = 0, fresh = 0;
  for (const ing of ings) {
    const cfg = shelf.get(ing.ingredientName);
    if (!cfg) throw new Error(`No shelf config: ${ing.ingredientName}`);
    const batches = await prisma.restockBatch.findMany({
      where: { ingredientId: ing.ingredientId }, orderBy: { restockId: "desc" },
    });
    const total = batches.reduce((s, b) => s + Number(b.quantityLeft), 0);
    const qty = total > 0 ? Math.round(total * 1000) / 1000 : cfg.q;
    if (total <= 0) fresh++;
    const cost = batches.length ? Number(batches[0].costPerUnit) : 0.1;
    const expiry = new Date(todayUTC.getTime() + cfg.s * 86400000);
    rows.push({
      ingredientId: ing.ingredientId, restockedById: ADMIN_ID,
      quantityAdded: qty, quantityLeft: qty, costPerUnit: cost,
      totalCost: Math.round(qty * cost * 100) / 100,
      supplierName: "Consolidation (Seed)",
      notes: total > 0 ? "Consolidated active stock (history depleted)" : "Fresh parcel (stock was fully consumed)",
      expiryDate: expiry, restockedAt: now,
    });
    const r = await prisma.$executeRawUnsafe(
      `UPDATE restock_batches SET quantity_left = 0, expiry_date = NULL WHERE ingredient_id = '${ing.ingredientId}'`);
    zeroed += Number(r);
  }
  console.log(`  zeroed ${zeroed} history batches (${fresh} were fully consumed -> fresh parcel)`);

  for (let i = 0; i < rows.length; i += 1000) {
    await prisma.restockBatch.createMany({ data: rows.slice(i, i + 1000), skipDuplicates: true });
  }
  console.log(`  ✓ ${rows.length} active batches created`);

  // Verify: sums unchanged (except fresh parcels), 1 active each
  const after = await prisma.$queryRawUnsafe(
    `SELECT ingredient_id AS id, COALESCE(SUM(quantity_left),0)::float AS t,
            COUNT(*) FILTER (WHERE quantity_left > 0)::int AS active
     FROM restock_batches GROUP BY ingredient_id`);
  const bMap = new Map(before.map((r) => [r.id, r.t]));
  let bad = 0;
  for (const r of after) {
    const b = bMap.get(r.id) ?? 0;
    if (r.active !== 1) { console.log(`  !! ${r.id}: active=${r.active}`); bad++; }
    else if (b > 0 && Math.abs(r.t - b) > 0.01) { console.log(`  !! ${r.id}: total changed ${b} -> ${r.t}`); bad++; }
  }
  const expiredActive = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*)::int AS n FROM restock_batches
     WHERE quantity_left > 0 AND expiry_date IS NOT NULL AND expiry_date < (NOW() AT TIME ZONE 'Asia/Manila')::date`);
  console.log(`  expired-with-stock batches: ${expiredActive[0].n}`);
  console.log(bad === 0 && expiredActive[0].n === 0 ? "  ✓ ALL CHECKS PASSED" : `  !! ${bad} problems`);
}

main()
  .catch((e) => { console.error("Consolidation failed:", e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
