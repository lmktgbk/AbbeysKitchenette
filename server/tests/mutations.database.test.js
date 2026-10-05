import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from "vitest";
const h = vi.hoisted(() => ({ db: null }));
vi.mock("../src/config/prisma.js", () => ({ default: new Proxy({}, { get: (_target, key) => typeof h.db[key] === "function" ? h.db[key].bind(h.db) : h.db[key] }) }));
vi.mock("../src/config/env.js", () => ({ env: {} }));
vi.mock("../src/modules/anomalyDetection/anomalyDetection.service.js", () => ({ anomalyService: { runScan: vi.fn().mockResolvedValue() } }));
vi.mock("../src/modules/priceOptimization/priceOptimization.prompts.js", () => ({ generatePriceSuggestions: vi.fn(), getCompetitorAverage: () => 75 }));
import { isolatedPostgres } from "./helpers/isolatedPostgres.js";
import { shiftService } from "../src/modules/shifts/shift.service.js";
import pricing from "../src/modules/priceOptimization/priceOptimization.service.js";
import { createEffectsRepository } from "../src/infrastructure/effects/effects.repository.js";
let fixture, db, user;
describe.skipIf(process.env.MUTATION_DB_CHECK !== "1")("PostgreSQL pricing and shift audit recovery", () => {
  beforeAll(async () => { fixture = await isolatedPostgres("mutation_check"); db = h.db = fixture.db; }, 90000);
  afterAll(async () => { await fixture?.cleanup(); }, 30000);
  beforeEach(async () => {
    await db.domainEffect.deleteMany(); await db.auditLog.deleteMany();
    await db.shift.deleteMany(); await db.product.deleteMany(); await db.subcategory.deleteMany();
    await db.category.deleteMany(); await db.user.deleteMany();
    user = await db.user.create({ data: { name: "Fixture", email: "fixture@example.invalid", role: "admin", passwordHash: "unused" } });
  }, 20000);
  async function blocked(work) {
    await db.$executeRawUnsafe("ALTER TABLE domain_effects ADD CONSTRAINT fixture_block_effect CHECK (false) NOT VALID");
    try { await expect(work()).rejects.toThrow(); }
    finally { await db.$executeRawUnsafe("ALTER TABLE domain_effects DROP CONSTRAINT fixture_block_effect"); }
  }
  async function open() { return shiftService.openShift({ openingCash: 100, userId: user.id }); }
  async function close(id) { return shiftService.closeShift({ id, actualCash: 100, userId: user.id }); }
  it("concurrent opening commits one drawer and one recoverable audit", async () => {
    const results = await Promise.allSettled([open(), open()]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find(r => r.status === "rejected").reason.statusCode).toBe(409);
    expect(await db.shift.count()).toBe(1); expect(await db.domainEffect.count()).toBe(1);
    await createEffectsRepository(db).deliverOne(); expect(await db.auditLog.count()).toBe(1);
  }, 30000);
  it("audit capture failure rolls opening back", async () => {
    await blocked(open); expect(await db.shift.count()).toBe(0);
    await open(); expect(await db.domainEffect.count()).toBe(1);
  }, 30000);
  it("concurrent closing returns its committed snapshot and records only one close", async () => {
    const shift = await open();
    const results = await Promise.allSettled([close(shift.shift_id), close(shift.shift_id)]);
    const success = results.filter(r => r.status === "fulfilled"); expect(success).toHaveLength(1);
    expect(success[0].value.summary).toMatchObject({ expected_cash: 100, actual_cash: 100, variance: 0 });
    expect(results.find(r => r.status === "rejected").reason.statusCode).toBe(409);
    expect(await db.domainEffect.count()).toBe(2);
    const worker = createEffectsRepository(db); await worker.deliverOne(); await worker.deliverOne();
    expect(await db.auditLog.count()).toBe(2);
  }, 30000);
  it("audit capture failure keeps the drawer open and permits retry", async () => {
    const shift = await open(); await blocked(() => close(shift.shift_id));
    expect((await db.shift.findFirst()).status).toBe("open");
    expect(await db.domainEffect.count()).toBe(1); await close(shift.shift_id);
    expect(await db.domainEffect.count()).toBe(2);
  }, 30000);
  it.each(["applyPrice", "dismiss"])("%s rolls resolution back on audit failure and recovers after retry", async action => {
    const category = await db.category.create({ data: { categoryName: "Fixture" } });
    const sub = await db.subcategory.create({ data: { categoryId: category.categoryId, subcategoryName: "Fixture" } });
    const product = await db.product.create({ data: { subcategoryId: sub.subcategoryId, productName: "Coffee" } });
    const variant = await db.productVariant.create({ data: { productId: product.productId, sizeName: "Regular", price: 85 } });
    const suggestion = await db.priceOptimization.create({ data: { variantId: variant.variantId, productName: "Coffee", sizeName: "Regular", currentPrice: 85, recommendedPrice: 95, priceChange: 10, changePercent: 11.76, direction: "increase", confidence: 0.8, reasoning: "Fixture", marginBefore: 50, marginAfter: 55 } });
    await blocked(() => pricing[action](suggestion.id, user.id));
    expect((await db.priceOptimization.findFirst()).status).toBe("pending");
    expect(Number((await db.productVariant.findFirst()).price)).toBe(85);
    await pricing[action](suggestion.id, user.id);
    await expect(pricing[action](suggestion.id, user.id)).rejects.toMatchObject({ statusCode: 409 });
    await createEffectsRepository(db).deliverOne();
    expect(await db.auditLog.count()).toBe(1); expect(await db.domainEffect.count()).toBe(1);
  }, 30000);
});
