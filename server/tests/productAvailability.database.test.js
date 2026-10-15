import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { isolatedPostgres } from "./helpers/isolatedPostgres.js";
const h = vi.hoisted(() => ({ db: null }));
vi.mock("../src/config/prisma.js", () => ({ default: new Proxy({}, { get: (_, key) => typeof h.db[key] === "function" ? h.db[key].bind(h.db) : h.db[key] }) }));
import { productRepository as repo } from "../src/modules/products/product.repository.js";
import { productService } from "../src/modules/products/product.service.js";
import { guestService } from "../src/modules/guest/guest.service.js";
let fixture, db;
describe.skipIf(process.env.PRODUCT_AVAILABILITY_DB_CHECK !== "1")("Catalog sellability consistency", () => {
  beforeAll(async () => { fixture = await isolatedPostgres("catalog_availability"); db = h.db = fixture.db; }, 180000);
  afterAll(async () => { await fixture?.cleanup(); }, 30000);
  it("aligns card reasons, filter membership, summary and menu across stock and manual states", async () => {
    const root = await db.category.create({ data: { categoryName: "Fixture" } });
    const sub = await db.subcategory.create({ data: { categoryId: root.categoryId, subcategoryName: "Fixture" } });
    const user = await db.user.create({ data: { name: "Fixture", email: "catalog@invalid.example", role: "admin", passwordHash: "unused" } });
    const ingredient = await db.ingredient.create({ data: { ingredientName: "Milk", unit: "ml", minimumThreshold: 0 } });
    const [clock] = await db.$queryRaw`SELECT (now() AT TIME ZONE 'Asia/Manila')::date::text AS today`;
    const expired = new Date(Date.parse(clock.today) - 86400000);
    const batch = await db.restockBatch.create({ data: { ingredientId: ingredient.ingredientId, restockedById: user.id, quantityAdded: 100, quantityLeft: 100, costPerUnit: 1, totalCost: 100 } });
    async function product(name, needs, flags = {}) {
      const p = await db.product.create({ data: { productId: randomUUID(), productName: name, subcategoryId: sub.subcategoryId, ...flags } });
      for (let i = 0; i < needs.length; i++) {
        const v = await db.productVariant.create({ data: { productId: p.productId, sizeName: String(i), price: 100 } });
        if (needs[i] != null) await db.recipe.create({ data: { variantId: v.variantId, ingredientId: ingredient.ingredientId, quantityNeeded: needs[i] } });
      }
      return p;
    }
    await product("Available", [100]); await product("Partial", [100, 200]);
    await product("Out", [200]); await product("Disabled", [100], { isAvailable: false });
    await product("Setup", [null]); await product("No variants", []);
    const params = { skip: 0, take: 50, status: "all" };
    const rows = await repo.findManyPaginated(params);
    expect(Object.fromEntries(rows.map(r => [r.product_name, r.availability_status]))).toEqual({ Available: "available", Partial: "partial", Out: "out_of_stock", Disabled: "deactivated", Setup: "setup_needed", "No variants": "setup_needed" });
    const summary = await repo.countByStatus(); expect(summary).toMatchObject({ total: 6, available: 2, unavailable: 4 });
    expect(await repo.countFiltered({ status: "unavailable" })).toBe(4);
    expect((await repo.findManyPaginated({ ...params, status: "unavailable" })).map(r => r.product_name).sort()).toEqual(["Disabled", "No variants", "Out", "Setup"]);
    const menu = await guestService.getMenu({});
    for (const p of menu) expect(p.is_available).toBe(rows.find(r => r.product_id === p.product_id).has_active_variant);
    for (const p of rows) expect((await productService.getById(p.product_id)).availability_status).toBe(p.availability_status);
    await db.restockBatch.update({ where: { restockId: batch.restockId }, data: { expiryDate: expired } });
    expect((await repo.countByStatus()).available).toBe(0);
    expect((await guestService.getMenu({})).every(p => !p.is_available)).toBe(true);
  }, 60000);
});
