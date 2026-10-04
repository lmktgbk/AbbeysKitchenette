import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from "vitest";
const h = vi.hoisted(() => ({ db: null }));
vi.mock("../src/config/prisma.js", () => ({ default: new Proxy({}, { get: (_target, key) => typeof h.db[key] === "function" ? h.db[key].bind(h.db) : h.db[key] }) }));
vi.mock("../src/config/env.js", () => ({ env: {} }));
vi.mock("../src/modules/auditLogs/auditLog.service.js", () => ({ auditLogService: { logAction: vi.fn() } }));
vi.mock("../src/modules/anomalyDetection/anomalyDetection.service.js", () => ({ anomalyService: { runScan: vi.fn().mockResolvedValue() } }));
vi.mock("../src/modules/settings/settings.service.js", () => ({ settingsService: { getAcceptedPayments: async () => ["cash"] } }));
import { isolatedPostgres } from "./helpers/isolatedPostgres.js";
import { recordEffects } from "../src/infrastructure/effects/domainEffects.js";
import { createEffectsRepository } from "../src/infrastructure/effects/domainEffects.repository.js";
import { orderService } from "../src/modules/orders/order.service.js";
import { ingredientService } from "../src/modules/ingredients/ingredient.service.js";
let fixture, db, repo, user, ingredient, variant, batch;
describe.skipIf(process.env.EFFECTS_DB_CHECK !== "1")("PostgreSQL durable effects and derived repair", () => {
  beforeAll(async () => { fixture = await isolatedPostgres("effects_check"); db = h.db = fixture.db; repo = createEffectsRepository(db); }, 90000);
  afterAll(async () => { await fixture?.cleanup(); }, 30000);
  beforeEach(async () => {
    await db.domainEffect.deleteMany(); await db.notification.deleteMany(); await db.auditLog.deleteMany();
    await db.orderRequest.deleteMany();
    await db.order.deleteMany(); await db.shift.deleteMany();
    await db.product.deleteMany(); await db.restockBatch.deleteMany(); await db.ingredient.deleteMany();
    await db.subcategory.deleteMany(); await db.category.deleteMany(); await db.user.deleteMany();
    user = await db.user.create({ data: { name: "Fixture", email: "fixture@example.invalid", role: "admin", passwordHash: "unused" } });
    const category = await db.category.create({ data: { categoryName: "Fixture" } });
    const sub = await db.subcategory.create({ data: { categoryId: category.categoryId, subcategoryName: "Fixture" } });
    const product = await db.product.create({ data: { subcategoryId: sub.subcategoryId, productName: "Coffee" } });
    ingredient = await db.ingredient.create({ data: { ingredientName: "Coffee", unit: "g", minimumThreshold: 2 } });
    variant = await db.productVariant.create({ data: { productId: product.productId, sizeName: "Regular", price: 85,
      recipes: { create: { ingredientId: ingredient.ingredientId, quantityNeeded: 2 } } } });
    batch = await db.restockBatch.create({ data: { ingredientId: ingredient.ingredientId, restockedById: user.id,
      quantityAdded: 10, quantityLeft: 10, costPerUnit: 2, totalCost: 20 } });
    await repo.repairAvailability();
  }, 20000);
  const intent = () => ({ audit: { userId: user.id, action: "STOCK_RESTOCKED", targetType: "ingredient", targetId: ingredient.ingredientId, details: { quantity: 10 } },
    notifications: [{ type: "stock_restocked", title: "Stock Restored", message: "Fixture restock", referenceType: "ingredient", referenceId: ingredient.ingredientId }] });
  async function enqueue() { return db.$transaction(tx => recordEffects(tx, intent())); }
  it("rolls back business writes, effect intent and repair intent together", async () => {
    await expect(db.$transaction(async tx => {
      await tx.restockBatch.update({ where: { restockId: batch.restockId }, data: { quantityLeft: 0 } });
      await recordEffects(tx, intent()); throw Error("Fixture rollback");
    })).rejects.toThrow("Fixture rollback");
    expect(Number((await db.restockBatch.findUnique({ where: { restockId: batch.restockId } })).quantityLeft)).toBe(10);
    expect(await db.domainEffect.count()).toBe(0); expect(await db.availabilityRepair.count()).toBe(0);
  }, 20000);
  it("recovers committed work through a new repository without repeating the primary mutation", async () => {
    const event = await enqueue();
    const recovered = createEffectsRepository(db); await recovered.deliverOne(); await recovered.deliverOne();
    expect(await db.auditLog.count()).toBe(1); expect(await db.notification.count()).toBe(1);
    expect((await db.domainEffect.findUnique({ where: { id: event.id } })).state).toBe("delivered");
    expect(Number((await db.restockBatch.findUnique({ where: { restockId: batch.restockId } })).quantityLeft)).toBe(10);
  }, 20000);
  it("concurrent workers deliver one audit and notification", async () => {
    await enqueue(); await Promise.all([repo.deliverOne(), repo.deliverOne(), repo.deliverOne()]);
    expect(await db.auditLog.count()).toBe(1); expect(await db.notification.count()).toBe(1);
  }, 20000);
  it("rolls back partial delivery and retries on a database failure", async () => {
    await enqueue();
    await db.$executeRawUnsafe("ALTER TABLE notifications ADD CONSTRAINT fixture_delivery_failure CHECK (type <> 'stock_restocked')");
    try { expect(await repo.deliverOne()).toEqual({ deferred: true }); }
    finally { await db.$executeRawUnsafe("ALTER TABLE notifications DROP CONSTRAINT fixture_delivery_failure"); }
    expect(await db.auditLog.count()).toBe(0); expect(await db.notification.count()).toBe(0);
    const event = await db.domainEffect.findFirst(); expect(event.attempts).toBe(1); expect(event.state).toBe("pending");
    await db.domainEffect.update({ where: { id: event.id }, data: { nextAttemptAt: new Date(0) } });
    await repo.deliverOne(); expect(await db.auditLog.count()).toBe(1); expect(await db.notification.count()).toBe(1);
  }, 20000);
  it("blocks poison work after bounded retries while other work remains deliverable", async () => {
    await db.domainEffect.create({ data: { payload: { version: 999 } } });
    for (let i = 0; i < 6; i++) {
      await db.domainEffect.updateMany({ data: { nextAttemptAt: new Date(0) } }); await repo.deliverOne();
    }
    expect((await db.domainEffect.findFirst()).state).toBe("blocked");
    await enqueue(); await repo.deliverOne(); expect(await db.notification.count()).toBe(1);
  }, 20000);
  it("preserves actor identity when the user disappears before delivery", async () => {
    await enqueue(); await db.restockBatch.deleteMany(); await db.user.delete({ where: { id: user.id } });
    await repo.deliverOne(); const log = await db.auditLog.findFirst();
    expect(log.userId).toBeNull(); expect(log.details.actor_id).toBe(user.id);
  }, 20000);
  it("recovers availability after a committed stock change and restart", async () => {
    await db.restockBatch.update({ where: { restockId: batch.restockId }, data: { quantityLeft: 1 } });
    expect(await db.availabilityRepair.count()).toBe(1);
    await createEffectsRepository(db).repairAvailability();
    expect((await db.productVariant.findUnique({ where: { variantId: variant.variantId } })).isAvailable).toBe(false);
    expect(await db.availabilityRepair.count()).toBe(0);
  }, 20000);
  it("keeps manual deactivation and refreshes recipe/archival changes", async () => {
    await db.productVariant.update({ where: { variantId: variant.variantId }, data: { isManuallyDeactivated: true, isAvailable: false } });
    await db.restockBatch.update({ where: { restockId: batch.restockId }, data: { quantityLeft: 20 } }); await repo.repairAvailability();
    expect((await db.productVariant.findUnique({ where: { variantId: variant.variantId } })).isAvailable).toBe(false);
    await db.productVariant.update({ where: { variantId: variant.variantId }, data: { isManuallyDeactivated: false } });
    await db.recipe.updateMany({ data: { quantityNeeded: 30 } }); await repo.repairAvailability();
    expect((await db.productVariant.findUnique({ where: { variantId: variant.variantId } })).isAvailable).toBe(false);
    await db.recipe.updateMany({ data: { quantityNeeded: 2 } }); await repo.repairAvailability();
    expect((await db.productVariant.findUnique({ where: { variantId: variant.variantId } })).isAvailable).toBe(true);
    await db.ingredient.update({ where: { ingredientId: ingredient.ingredientId }, data: { isArchived: true } }); await repo.repairAvailability();
    expect((await db.productVariant.findUnique({ where: { variantId: variant.variantId } })).isAvailable).toBe(false);
  }, 20000);
  it("does not erase a newer repair revision", async () => {
    await db.restockBatch.update({ where: { restockId: batch.restockId }, data: { quantityLeft: 0 } });
    const old = await db.availabilityRepair.findFirst();
    await db.restockBatch.update({ where: { restockId: batch.restockId }, data: { quantityLeft: 10 } });
    const deleted = await db.availabilityRepair.deleteMany({ where: { variantId: old.variantId, revision: old.revision } });
    expect(deleted.count).toBe(0); await repo.repairAvailability();
    expect((await db.productVariant.findUnique({ where: { variantId: variant.variantId } })).isAvailable).toBe(true);
  }, 20000);
  it("allows concurrent repairs and cascaded product deletion without orphan work", async () => {
    await db.restockBatch.update({ where: { restockId: batch.restockId }, data: { quantityLeft: 0 } });
    await Promise.all([repo.repairAvailability(), repo.repairAvailability()]);
    expect((await db.productVariant.findUnique({ where: { variantId: variant.variantId } })).isAvailable).toBe(false);
    await db.product.deleteMany(); expect(await db.availabilityRepair.count()).toBe(0);
  }, 20000);
  it("retains a change committed after a worker reads the repair queue", async () => {
    await db.restockBatch.update({ where: { restockId: batch.restockId }, data: { quantityLeft: 0 } });
    const paused = createEffectsRepository({
      availabilityRepair: { async findMany(options) {
        const jobs = await db.availabilityRepair.findMany(options);
        await db.restockBatch.update({ where: { restockId: batch.restockId }, data: { quantityLeft: 10 } });
        return jobs;
      } }, $transaction: db.$transaction.bind(db),
    });
    await paused.repairAvailability(); expect(await db.availabilityRepair.count()).toBe(1);
    await repo.repairAvailability(); expect(await db.availabilityRepair.count()).toBe(0);
    expect((await db.productVariant.findUnique({ where: { variantId: variant.variantId } })).isAvailable).toBe(true);
  }, 20000);
  it("a real paid order commits one frozen event and does not recreate it on replay", async () => {
    await db.shift.create({ data: { openedBy: user.id, openingCash: 0 } });
    const input = { customerName: "Fixture", tableNumber: "1", items: [{ product_id: variant.productId, variant_id: variant.variantId, quantity: 1, unit_price: 85 }],
      amountPaid: 85, createdBy: user.id, idempotencyKey: "123e4567-e89b-42d3-a456-426614174111" };
    const first = await orderService.createWalkIn(input); expect(await orderService.createWalkIn(input)).toEqual(first);
    expect(await db.domainEffect.count()).toBe(1); expect(await db.receipt.count()).toBe(1);
    expect(Number((await db.restockBatch.findUnique({ where: { restockId: batch.restockId } })).quantityLeft)).toBe(8);
    await repo.deliverOne(); expect(await db.auditLog.count()).toBe(1); expect(await db.notification.count()).toBe(1);
    expect((await db.notification.findFirst()).referenceId).toBe(first.order_id);
  }, 30000);
  it("real inventory restock, loss and count preserve their audit intents", async () => {
    await ingredientService.restock(ingredient.ingredientId, { quantity_added: 2, cost_per_unit: 2 }, user.id);
    await ingredientService.declareLoss(ingredient.ingredientId, { quantity_lost: 1, loss_type: "spillage" }, user.id);
    await ingredientService.recordCount(ingredient.ingredientId, { physical_quantity: 1, reason: "other" }, user.id);
    expect(await db.domainEffect.count()).toBe(3);
    await repo.deliverOne(); await repo.deliverOne(); await repo.deliverOne();
    expect(await db.auditLog.count()).toBe(3); expect((await db.notification.findFirst()).type).toBe("stock_low");
    await repo.repairAvailability(); expect((await db.productVariant.findUnique({ where: { variantId: variant.variantId } })).isAvailable).toBe(false);
  }, 30000);
  it("real ingredient CRUD records audit work atomically", async () => {
    const created = await ingredientService.create({ ingredient_name: "New", unit: "g" }, user.id);
    await ingredientService.update(created.ingredient_id, { minimum_threshold: 3 }, user.id);
    await ingredientService.archive(created.ingredient_id, user.id);
    await ingredientService.restore(created.ingredient_id, user.id);
    await ingredientService.delete(created.ingredient_id, user.id);
    expect(await db.domainEffect.count()).toBe(5);
    for (let i = 0; i < 5; i++) await repo.deliverOne();
    expect(await db.auditLog.count()).toBe(5);
  }, 30000);
  it("real batch expiry edits save an audit intent in the same transaction", async () => {
    await ingredientService.updateBatchExpiry(ingredient.ingredientId, batch.restockId, "2026-12-01", user.id);
    const event = await db.domainEffect.findFirst();
    expect(event.payload.audit.targetId).toBe(String(batch.restockId));
    expect(event.payload.audit.details.expiry_date).toBe("2026-12-01");
    await repo.deliverOne(); expect(await db.auditLog.count()).toBe(1);
  }, 20000);
  it("an unavailable outbox rolls back an actual paid order and its stock deduction", async () => {
    await db.shift.create({ data: { openedBy: user.id, openingCash: 0 } });
    await db.$executeRawUnsafe("ALTER TABLE domain_effects ADD CONSTRAINT fixture_intent_failure CHECK (payload->>'version' <> '1')");
    try {
      await expect(orderService.createWalkIn({ customerName: "Fixture", tableNumber: "1",
        items: [{ product_id: variant.productId, variant_id: variant.variantId, quantity: 1, unit_price: 85 }],
        amountPaid: 85, createdBy: user.id, idempotencyKey: "123e4567-e89b-42d3-a456-426614174111" })).rejects.toThrow();
    } finally { await db.$executeRawUnsafe("ALTER TABLE domain_effects DROP CONSTRAINT fixture_intent_failure"); }
    expect(await db.order.count()).toBe(0); expect(await db.receipt.count()).toBe(0); expect(await db.orderRequest.count()).toBe(0);
    expect(await db.domainEffect.count()).toBe(0); expect(await db.availabilityRepair.count()).toBe(0);
    expect(Number((await db.restockBatch.findUnique({ where: { restockId: batch.restockId } })).quantityLeft)).toBe(10);
  }, 30000);
  it("concurrent restocks produce a consistent before/after ledger", async () => {
    await Promise.all([
      ingredientService.restock(ingredient.ingredientId, { quantity_added: 2, cost_per_unit: 2 }, user.id),
      ingredientService.restock(ingredient.ingredientId, { quantity_added: 3, cost_per_unit: 2 }, user.id),
    ]);
    const adjustments = await db.stockAdjustment.findMany({ orderBy: { quantityBefore: "asc" } });
    expect(adjustments).toHaveLength(2);
    expect(Number(adjustments[0].quantityBefore)).toBe(10);
    expect(Number(adjustments[1].quantityBefore)).toBe(Number(adjustments[0].quantityAfter));
    expect(Number(adjustments[1].quantityAfter)).toBe(15);
    expect(await db.domainEffect.count()).toBe(2);
  }, 30000);
});
