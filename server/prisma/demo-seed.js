import "dotenv/config";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { PrismaClient } from "../src/generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import { ingredients, products } from "./demo/catalog.js";
import { receipts } from "./demo/receipts.js";
import { START, dates, planDay, validateCatalog, marker, at, SeedError } from "./demo/plan.js";
import { initialize, loadCatalog, writeDay, closingStock } from "./demo/write.js";

/** Preview is the default. No connection is opened without an explicit --apply. */
async function main() {
  const args = process.argv.slice(2);
  const allowed = ["--apply", "--confirm=RESET_SMARTCAFE"];
  if (args.some((arg) => !allowed.includes(arg) && !/^--(through|mode)=/.test(arg))) throw new SeedError("Unknown seed option");
  const mode = args.find((arg) => arg.startsWith("--mode="))?.slice(7) ?? "fresh";
  if (!["fresh", "extend"].includes(mode)) throw new SeedError("Mode must be fresh or extend");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const through = args.find((arg) => arg.startsWith("--through="))?.slice(10) ?? new Date(Date.parse(today) - 86400000).toISOString().slice(0, 10);
  const days = dates(START, through);
  if (through >= today) throw new SeedError("Only completed Manila days may be seeded");
  validateCatalog();
  let orders = 0, units = 0, samples = 0;
  for (const day of days) for (const order of planDay(day)) {
    orders++; units += order.lines.reduce((sum, line) => sum + line.quantity, 0);
    if (order.source === "receipt") samples++;
  }
  console.log(JSON.stringify({ mode, from: START, through, days: days.length, ingredients: ingredients.length, products: products.length,
    variants: products.reduce((sum, product) => sum + product[3].length, 0), orders, units, receiptSamplesInRange: samples, receiptSamplesAvailable: receipts.length,
    applyRequested: args.includes("--apply") }, null, 2));
  if (!args.includes("--apply")) return;
  if (mode === "fresh" && !args.includes("--confirm=RESET_SMARTCAFE")) throw new SeedError("Fresh mode deletes application data; require --confirm=RESET_SMARTCAFE");
  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!connectionString) throw new SeedError("DIRECT_URL or DATABASE_URL is required");
  const lock = new pg.Client({ connectionString, connectionTimeoutMillis: 10000 });
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString, max: 2, connectionTimeoutMillis: 10000 }) });
  try {
    await lock.connect();
    // Session-level lock serializes seed processes across per-day transactions.
    const { rows: [state] } = await lock.query("SELECT pg_try_advisory_lock(873241, 1) AS acquired, current_schema() AS schema");
    if (!state.acquired || state.schema !== "public") throw new SeedError("Seed already running or target schema is not public");
    const [target] = await prisma.$queryRaw`SELECT current_schema() AS schema`;
    if (target.schema !== "public") throw new SeedError("Unexpected Prisma target schema");
    if (mode === "fresh") {
      // Read only declared model table names. Migration history and Supabase auth/storage stay outside this list.
      const schema = await readFile(new URL("./schema.prisma", import.meta.url), "utf8");
      const tables = [...schema.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)\n\}/g)].map((match) => match[2].match(/@@map\("([a-z_][a-z0-9_]*)"\)/)?.[1] ?? match[1]);
      if (tables.some((table) => !table)) throw new SeedError("An unmapped model requires explicit seed reset support");
      await initialize(prisma, tables, process.env.DEMO_ADMIN_EMAIL, process.env.DEMO_ADMIN_PASSWORD);
    }
    const catalog = await loadCatalog(prisma);
    const latest = await prisma.shift.findFirst({ where: { closeNote: marker }, orderBy: { openedAt: "desc" } });
    if (latest && latest.openedAt > at(through, "16:00")) throw new SeedError("Cannot extend backward over newer seeded days");
    let added = 0;
    for (const day of days) {
      if (await writeDay(prisma, day, catalog)) added++;
      if (added && added % 14 === 0) console.log(`Seed progress: ${day}`);
    }
    const closed = await prisma.restockBatch.findFirst({ where: { notes: `${marker}:closing`, restockedAt: at(through, "23:58") } });
    if (added || !closed) await closingStock(prisma, through);
    console.log(`Completed: ${added} new days. Existing checkpoints were preserved.`);
  } finally {
    await prisma.$disconnect();
    await lock.end();
  }
}

main().catch((error) => {
  // Connection errors can contain credentials. Keep CLI output deliberately sanitized.
  if (error instanceof SeedError) console.error(error.message);
  console.error("Seed did not complete. Check options, admin credentials, database connectivity and migrations. Already committed days can resume with --mode=extend.");
  process.exitCode = 1;
});
