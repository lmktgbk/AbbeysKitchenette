import prisma from "./src/config/prisma.js";

/**
 * Seed test data for intelligence panels.
 *
 * 1. Raises thresholds on a few ingredients to trigger reorder suggestions
 * 2. Creates stock deduction records (simulates order consumption)
 * 3. Adds loss records (waste patterns)
 */

async function main() {
  console.log("=== Seeding Intelligence Test Data ===\n");

  // Get admin user ID for foreign keys
  const admin = await prisma.user.findFirst({ where: { role: "admin" } });
  if (!admin) {
    console.error("No admin user found. Run seed.js first.");
    return;
  }
  const adminId = admin.id;

  // ── 1. Lower stock + raise thresholds to trigger reorder ──────────

  console.log("--- Adjusting thresholds ---");

  const toAdjust = [
    { name: "Lemon", newThreshold: 80 },          // stock=68 → below threshold
    { name: "Eggs", newThreshold: 160 },           // stock=148 → below threshold
    { name: "Bread (Sliced)", newThreshold: 200 }, // stock=197 → at threshold
    { name: "Blueberries", newThreshold: 1000 },   // stock=925 → below threshold
    { name: "Vanilla Syrup", newThreshold: 2500 }, // stock=2310 → below threshold
  ];

  for (const adj of toAdjust) {
    const ingredient = await prisma.ingredient.findFirst({
      where: { ingredientName: adj.name },
    });
    if (!ingredient) {
      console.log(`  SKIP: ${adj.name} not found`);
      continue;
    }
    await prisma.ingredient.update({
      where: { ingredientId: ingredient.ingredientId },
      data: { minimumThreshold: adj.newThreshold },
    });
    console.log(`  ${adj.name}: threshold → ${adj.newThreshold}`);
  }

  // ── 2. Create stock deduction records (last 14 days) ─────────────

  console.log("\n--- Creating stock deduction records ---");

  // Get some ingredients to create deductions for
  const deductionIngredients = await prisma.ingredient.findMany({
    where: {
      isArchived: false,
      ingredientName: {
        in: [
          "Milk (Fresh)",
          "Espresso Beans",
          "Sugar",
          "Tea Leaves (Black)",
          "Coffee Beans",
          "Chocolate Syrup",
        ],
      },
    },
  });

  const now = new Date();
  const deductions = [];

  for (const ing of deductionIngredients) {
    // Create 5-8 deduction records per ingredient over the last 14 days
    const count = 5 + Math.floor(Math.random() * 4);
    for (let i = 0; i < count; i++) {
      const daysAgo = Math.floor(Math.random() * 14);
      const date = new Date(now);
      date.setDate(date.getDate() - daysAgo);
      date.setHours(
        8 + Math.floor(Math.random() * 10),
        Math.floor(Math.random() * 60),
        0,
        0,
      );

      // Random quantity between 5 and 30
      const qty = 5 + Math.floor(Math.random() * 26);

      // Get current stock for before/after
      const batch = await prisma.restockBatch.findFirst({
        where: {
          ingredientId: ing.ingredientId,
          quantityLeft: { gt: 0 },
        },
        orderBy: { restockedAt: "asc" },
      });

      if (!batch) continue;

      const stockBefore = Number(batch.quantityLeft);
      const stockAfter = Math.max(0, stockBefore - qty);

      deductions.push({
        ingredientId: ing.ingredientId,
        adjustedById: adminId,
        adjustmentType: "deduction",
        quantityBefore: stockBefore,
        quantityChanged: qty,
        quantityAfter: stockAfter,
        notes: "Test deduction — simulated order consumption",
        adjustedAt: date,
      });
    }
  }

  if (deductions.length > 0) {
    await prisma.stockAdjustment.createMany({ data: deductions });
    console.log(`  Created ${deductions.length} deduction records`);
  }

  // ── 3. Create loss records (waste patterns) ──────────────────────

  console.log("\n--- Creating loss records ---");

  const lossIngredients = [
    { name: "Milk (Fresh)", type: "spoilage", qty: 15, cost: 12 },
    { name: "Milk (Fresh)", type: "spoilage", qty: 10, cost: 12 },
    { name: "Bread (Sliced)", type: "expiry", qty: 8, cost: 5 },
    { name: "Bread (Sliced)", type: "expiry", qty: 5, cost: 5 },
    { name: "Lettuce", type: "spoilage", qty: 12, cost: 3 },
    { name: "Tomato", type: "spoilage", qty: 10, cost: 4 },
    { name: "Blueberries", type: "spoilage", qty: 6, cost: 15 },
    { name: "Eggs", type: "spillage", qty: 4, cost: 8 },
    { name: "Cheese", type: "expiry", qty: 7, cost: 10 },
  ];

  const losses = [];
  for (const l of lossIngredients) {
    const ingredient = await prisma.ingredient.findFirst({
      where: { ingredientName: l.name },
    });
    if (!ingredient) continue;

    const daysAgo = Math.floor(Math.random() * 25) + 1;
    const date = new Date(now);
    date.setDate(date.getDate() - daysAgo);

    // Find a batch to link
    const batch = await prisma.restockBatch.findFirst({
      where: { ingredientId: ingredient.ingredientId },
      orderBy: { restockedAt: "desc" },
    });

    losses.push({
      ingredientId: ingredient.ingredientId,
      declaredById: adminId,
      lossType: l.type,
      quantityLost: l.qty,
      costPerUnit: l.cost,
      totalCostLost: l.qty * l.cost,
      relatedRestockId: batch?.restockId || null,
      notes: `Test loss — ${l.type} waste`,
      loggedAt: date,
    });
  }

  if (losses.length > 0) {
    await prisma.lossRecord.createMany({ data: losses });
    console.log(`  Created ${losses.length} loss records`);
  }

  console.log("\n=== Done! ===");
  console.log("Restart the server and try generating insights again.");
  console.log("  Reorder: 5 ingredients now have stock below threshold");
  console.log("  Waste: 9 loss records with spoilage/expiry patterns");
  console.log("  Deductions: ~35 records simulating order consumption");

  await prisma.$disconnect();
}

main().catch(console.error);
