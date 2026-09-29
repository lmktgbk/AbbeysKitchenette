import "dotenv/config";
import { PrismaClient } from "../../src/generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// KEEP: users, system_settings, categories (+ their PK sequences untouched)
// DELETE: everything else (transactional + ML + catalog detail)
const DELETE_TABLES = [
  "audit_logs",
  "combo_created_pairs",
  "mba_rules",
  "mba_jobs",
  "price_optimizations",
  "waste_reductions",
  "reorder_suggestions",
  "forecast_results",
  "forecast_jobs",
  "anomaly_results",
  "stock_alerts",
  "stock_adjustments",
  "loss_records",
  "order_ingredient_deductions",
  "restock_batches",
  "order_cancellations",
  "payment_refunds",
  "receipts",
  "order_items",
  "orders",
  "order_counters",
  "recipes",
  "product_variants",
  "products",
  "ingredients",
  "subcategories",
  "notifications",
  "sheet_sync_log",
  "otp_codes",
  "password_reset_tokens",
  "shifts",
];

async function main() {
  console.log("Phase 0: wiping transactional/catalog data (keeping users, system_settings, categories)...\n");
  const quoted = DELETE_TABLES.map((t) => `"${t}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`);
  console.log(`  ✓ truncated ${DELETE_TABLES.length} tables`);

  const kept = {
    users: await prisma.user.count(),
    settings: await prisma.systemSettings.count(),
    categories: await prisma.category.count(),
  };
  console.log("  kept:", JSON.stringify(kept));
  if (kept.users === 0) throw new Error("users table is empty — aborting, wipe hit the wrong tables");
  if (kept.categories === 0) throw new Error("categories wiped — aborting");
}

main()
  .catch((e) => { console.error("Wipe failed:", e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
