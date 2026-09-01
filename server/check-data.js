import prisma from "./src/config/prisma.js";

async function main() {
  // 1. Get all ingredients with stock
  const ingredients = await prisma.ingredient.findMany({
    where: { isArchived: false },
    select: {
      ingredientId: true,
      ingredientName: true,
      unit: true,
      minimumThreshold: true,
    },
  });

  const batches = await prisma.restockBatch.groupBy({
    by: ["ingredientId"],
    _sum: { quantityLeft: true },
    where: { quantityLeft: { gt: 0 } },
  });

  const stockMap = {};
  for (const b of batches) {
    stockMap[b.ingredientId] = Number(b._sum.quantityLeft);
  }

  console.log("=== Current Ingredient Stock ===");
  for (const i of ingredients) {
    const stock = stockMap[i.ingredientId] || 0;
    const threshold = Number(i.minimumThreshold);
    console.log(
      `${i.ingredientName}: stock=${stock} threshold=${threshold} ratio=${(stock / Math.max(threshold, 1)).toFixed(1)}x`,
    );
  }

  // 2. Check forecast results
  const jobCount = await prisma.forecastJob.count({
    where: { status: "completed" },
  });
  const resultCount = await prisma.forecastResult.count({
    where: { skipped: false },
  });
  console.log(`\n=== Forecast: ${jobCount} completed jobs, ${resultCount} non-skipped results ===`);

  // 3. Check stock adjustments
  const deductionCount = await prisma.stockAdjustment.count({
    where: { adjustmentType: "deduction" },
  });
  console.log(`=== Stock deductions: ${deductionCount} ===`);

  // 4. Check loss records
  const lossCount = await prisma.lossRecord.count();
  console.log(`=== Loss records: ${lossCount} ===`);

  await prisma.$disconnect();
}

main().catch(console.error);
