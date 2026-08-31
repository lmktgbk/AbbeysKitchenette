import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Cleaning up database...\n");

  // Delete in FK-safe order (cascades handle children)
  const steps = [
    ["orders", () => prisma.order.deleteMany()],
    ["forecast_jobs", () => prisma.forecastJob.deleteMany()],
    ["order_counters", () => prisma.orderCounter.deleteMany()],
    ["recipes", () => prisma.recipe.deleteMany()],
    ["product_variants", () => prisma.productVariant.deleteMany()],
    ["products", () => prisma.product.deleteMany()],
    ["ingredients", () => prisma.ingredient.deleteMany()],
    ["categories", () => prisma.category.deleteMany()],
  ];

  for (const [table, fn] of steps) {
    const result = await fn();
    console.log(`  ✓ ${table}: ${result.count} rows deleted`);
  }

  console.log("\nCleanup complete. Users and SystemSettings preserved.");
}

main()
  .catch((e) => {
    console.error("Cleanup failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
