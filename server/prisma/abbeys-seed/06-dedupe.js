import "dotenv/config";
import { PrismaClient } from "../../src/generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const STALE = ["Blueberry", "Choco", "Mango", "Matcha", "Strawberry"];
const FIXED = { Blueberry: "Blueberry Frappe", Choco: "Choco Frappe", Mango: "Mango Frappe", Matcha: "Matcha Frappe", Strawberry: "Strawberry Frappe" };

async function main() {
  let moved = 0;
  for (const name of STALE) {
    const stale = await prisma.product.findFirst({
      where: { productName: name, subcategory: { subcategoryName: "Frappe" } },
      include: { variants: true },
    });
    if (!stale) { console.log(`  — not found: ${name}`); continue; }
    const fixed = await prisma.product.findFirst({
      where: { productName: FIXED[name] }, include: { variants: true },
    });
    if (!fixed) throw new Error(`fixed product missing: ${FIXED[name]}`);
    for (const sv of stale.variants) {
      const fv = fixed.variants.find((v) => v.sizeName === sv.sizeName);
      if (!fv) throw new Error(`size missing: ${FIXED[name]} ${sv.sizeName}`);
      const r = await prisma.orderItem.updateMany({
        where: { variantId: sv.variantId },
        data: { variantId: fv.variantId, productId: fixed.productId },
      });
      moved += r.count;
      console.log(`  ${name} ${sv.sizeName}: moved ${r.count} order items -> ${FIXED[name]}`);
    }
    await prisma.product.delete({ where: { productId: stale.productId } });
    console.log(`  ✓ deleted stale product: ${name}`);
  }
  console.log(`moved ${moved} order items total`);

  // Cosmetic rename
  const ugly = await prisma.product.findFirst({ where: { productName: "Passion Fruit Fruit Tea" } });
  if (ugly) {
    await prisma.product.update({ where: { productId: ugly.productId }, data: { productName: "Passion Fruit Tea" } });
    console.log("  ✓ renamed to Passion Fruit Tea");
  }
  console.log("products now:", await prisma.product.count(), "variants:", await prisma.productVariant.count());
}

main()
  .catch((e) => { console.error("Dedupe failed:", e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
