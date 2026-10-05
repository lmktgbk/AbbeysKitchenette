import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from "vitest";
const h = vi.hoisted(() => ({ db: null }));
vi.mock("../src/config/prisma.js", () => ({ default: new Proxy({}, { get: (_t, key) => typeof h.db[key] === "function" ? h.db[key].bind(h.db) : h.db[key] }) }));
vi.mock("../src/config/env.js", () => ({ env: { JWT_SECRET: "fixture-key-only", CLIENT_URL: "https://fixture.invalid" } }));
vi.mock("../src/infrastructure/integrations/email.js", () => ({ sendEmail: vi.fn().mockRejectedValue(Error("Fixture mail offline")), generateStaffInviteEmail: () => "fixture" }));
vi.mock("../src/infrastructure/storage/imageCleanup.js", () => ({ deleteImage: vi.fn().mockResolvedValue() }));
vi.mock("../src/modules/auditLogs/auditLog.service.js", () => ({ auditLogService: { logAction: vi.fn().mockResolvedValue() } }));
vi.mock("../src/infrastructure/realtime/sessions.js", () => ({ revokeLocalSessions: vi.fn() }));
import { isolatedPostgres } from "./helpers/isolatedPostgres.js";
import { productService as products } from "../src/modules/products/product.service.js";
import { categoryService as categories } from "../src/modules/categories/category.service.js";
import { staffService as staff } from "../src/modules/staff/staff.service.js";
import { settingsService as settings } from "../src/modules/settings/settings.service.js";
import { revokeLocalSessions } from "../src/infrastructure/realtime/sessions.js";
import { sendEmail } from "../src/infrastructure/integrations/email.js";
import { deleteImage } from "../src/infrastructure/storage/imageCleanup.js";
import { createEffectsRepository } from "../src/infrastructure/effects/effects.repository.js";
let fixture, db, actor, target, root, sub, product, variant;
describe.skipIf(process.env.ADMIN_DB_CHECK !== "1")("PostgreSQL administrative mutation recovery", () => {
  beforeAll(async () => { fixture = await isolatedPostgres("admin_check"); db = h.db = fixture.db; }, 90000);
  afterAll(async () => { await fixture?.cleanup(); }, 30000);
  beforeEach(async () => {
    vi.clearAllMocks();
    await db.domainEffect.deleteMany(); await db.notification.deleteMany(); await db.auditLog.deleteMany();
    await db.order.deleteMany(); await db.shift.deleteMany(); await db.product.deleteMany();
    await db.restockBatch.deleteMany(); await db.ingredient.deleteMany();
    await db.subcategory.deleteMany(); await db.category.deleteMany(); await db.user.deleteMany(); await db.systemSettings.deleteMany();
    actor = await db.user.create({ data: { name: "Admin", email: "admin@fixture.invalid", role: "admin", passwordHash: "unused" } });
    target = await db.user.create({ data: { name: "Cashier", email: "cashier@fixture.invalid", role: "cashier", passwordHash: "unused" } });
    root = await db.category.create({ data: { categoryName: "Fixture" } });
    sub = await db.subcategory.create({ data: { categoryId: root.categoryId, subcategoryName: "Fixture" } });
    product = await db.product.create({ data: { subcategoryId: sub.subcategoryId, productName: "Coffee" } });
    variant = await db.productVariant.create({ data: { productId: product.productId, sizeName: "Regular", price: 85 } });
  }, 30000);
  async function blocked(work) {
    await db.$executeRawUnsafe("ALTER TABLE domain_effects ADD CONSTRAINT fixture_block_effect CHECK (false) NOT VALID");
    try { await expect(work()).rejects.toThrow(); }
    finally { await db.$executeRawUnsafe("ALTER TABLE domain_effects DROP CONSTRAINT fixture_block_effect"); }
  }
  async function deliverAll() {
    const worker = createEffectsRepository(db);
    while (await worker.deliverOne()) { /* Drain only this disposable fixture's intents. */ }
  }
  it("identical concurrent settings saves commit one audit and notification", async () => {
    await Promise.all([settings.updateSettings({ storeName: "Updated" }, actor.id), settings.updateSettings({ storeName: "Updated" }, actor.id)]);
    expect(await db.domainEffect.count()).toBe(1); await deliverAll();
    expect(await db.auditLog.count()).toBe(1); expect(await db.notification.count()).toBe(1);
  }, 30000);
  it("settings intent failure rolls back the singleton write", async () => {
    await blocked(() => settings.updateSettings({ storeName: "Failed" }, actor.id));
    expect(await db.systemSettings.count()).toBe(0);
    expect((await settings.updateSettings({ storeName: "Retried" }, actor.id)).storeName).toBe("Retried");
  }, 30000);
  it("subcategory propagation and audit fail or commit together", async () => {
    const work = () => categories.updateSubcategory(sub.subcategoryId, { is_active: false }, actor.id);
    await blocked(work);
    expect((await db.subcategory.findFirst()).isActive).toBe(true);
    expect((await db.product.findFirst()).isAvailable).toBe(true);
    await work(); expect((await db.product.findFirst()).isAvailable).toBe(false);
    expect((await db.productVariant.findFirst()).isManuallyDeactivated).toBe(true);
    await deliverAll(); expect(await db.auditLog.count()).toBe(1);
  }, 30000);
  it("subcategory create/delete roll back when intent capture fails", async () => {
    await blocked(() => categories.createSubcategory(root.categoryId, { subcategory_name: "New" }, actor.id));
    expect(await db.subcategory.count()).toBe(1);
    const created = await categories.createSubcategory(root.categoryId, { subcategory_name: "New" }, actor.id);
    await blocked(() => categories.removeSubcategory(created.subcategory_id, actor.id));
    expect(await db.subcategory.count()).toBe(2);
    await categories.removeSubcategory(created.subcategory_id, actor.id); expect(await db.subcategory.count()).toBe(1);
    await expect(categories.removeSubcategory(sub.subcategoryId, actor.id)).rejects.toMatchObject({ code: "SUBCATEGORY_HAS_PRODUCTS" });
  }, 30000);
  it("product creation and update roll back and recover audit records", async () => {
    const data = { product_name: "Tea", subcategory_id: sub.subcategoryId, variants: [{ size_name: "Regular", price: 50 }] };
    await blocked(() => products.create(data, actor.id)); expect(await db.product.count()).toBe(1);
    const created = await products.create(data, actor.id);
    await blocked(() => products.update(created.product_id, { product_name: "New Tea" }, actor.id));
    expect((await db.product.findUnique({ where: { productId: created.product_id } })).productName).toBe("Tea");
    await products.update(created.product_id, { product_name: "New Tea" }, actor.id); await deliverAll();
    expect(await db.auditLog.count()).toBe(2);
  }, 30000);
  it("variant replacement rolls back recipes and rejects a foreign ID", async () => {
    await blocked(() => products.updateVariants(product.productId, [{ variant_id: variant.variantId, size_name: "Large", price: 100 }], actor.id));
    expect((await db.productVariant.findFirst()).sizeName).toBe("Regular");
    await expect(products.updateVariants(product.productId, [{ variant_id: variant.variantId + 999, size_name: "Foreign", price: 100 }], actor.id)).rejects.toMatchObject({ code: "VARIANT_CHANGED" });
    await products.updateVariants(product.productId, [{ variant_id: variant.variantId, size_name: "Large", price: 100 }], actor.id);
    expect(Number((await db.productVariant.findFirst()).price)).toBe(100); expect(await db.domainEffect.count()).toBe(1);
  }, 30000);
  it("concurrent variant deactivation leaves the parent inactive", async () => {
    const second = await db.productVariant.create({ data: { productId: product.productId, sizeName: "Large", price: 100 } });
    await Promise.all([products.deactivateVariant(product.productId, variant.variantId, actor.id), products.deactivateVariant(product.productId, second.variantId, actor.id)]);
    expect((await db.product.findFirst()).isAvailable).toBe(false);
    expect(await db.productVariant.count({ where: { isAvailable: true } })).toBe(0);
    expect(await db.domainEffect.count()).toBe(2);
  }, 30000);
  it("activation and deactivation roll back parent and variant state", async () => {
    await blocked(() => products.deactivate(product.productId, actor.id));
    expect((await db.product.findFirst()).isAvailable).toBe(true);
    await products.deactivate(product.productId, actor.id);
    await blocked(() => products.activateVariant(product.productId, variant.variantId, actor.id));
    expect((await db.product.findFirst()).isAvailable).toBe(false);
    expect((await db.productVariant.findFirst()).isManuallyDeactivated).toBe(true);
    await products.activateVariant(product.productId, variant.variantId, actor.id);
    expect((await db.product.findFirst()).isAvailable).toBe(true);
    expect(await db.availabilityRepair.count()).toBe(1);
  }, 30000);
  it("product delete preserves the old image on rollback", async () => {
    await db.product.update({ where: { productId: product.productId }, data: { imageUrl: "fixture-image" } });
    await blocked(() => products.remove(product.productId, actor.id)); expect(deleteImage).not.toHaveBeenCalled();
    await products.remove(product.productId, actor.id); expect(deleteImage).toHaveBeenCalledWith("fixture-image");
    expect(await db.product.count()).toBe(0); await deliverAll(); expect(await db.auditLog.count()).toBe(1);
  }, 30000);
  it("product activation rolls back all variants and queues eligible stock repair", async () => {
    const ingredient = await db.ingredient.create({ data: { ingredientName: "Beans", unit: "g", minimumThreshold: 1 } });
    await db.recipe.create({ data: { variantId: variant.variantId, ingredientId: ingredient.ingredientId, quantityNeeded: 2 } });
    await db.restockBatch.create({ data: { ingredientId: ingredient.ingredientId, restockedById: actor.id, quantityAdded: 10, quantityLeft: 10, costPerUnit: 1, totalCost: 10 } });
    await products.deactivate(product.productId, actor.id);
    await blocked(() => products.activate(product.productId, actor.id));
    expect((await db.product.findFirst()).isAvailable).toBe(false);
    const result = await products.activate(product.productId, actor.id);
    expect(result.summary).toEqual({ activated: ["Regular"], skipped: [] });
    await db.ingredient.update({ where: { ingredientId: ingredient.ingredientId }, data: { isArchived: true } });
    await expect(products.activateVariant(product.productId, variant.variantId, actor.id)).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
  }, 30000);
  it("bulk activation handles mixed stock without clearing skipped manual restrictions", async () => {
    const ingredient = await db.ingredient.create({ data: { ingredientName: "Fixture beans", unit: "g", minimumThreshold: 1 } });
    const low = await db.productVariant.create({ data: { productId: product.productId, sizeName: "Large", price: 100 } });
    const noRecipe = await db.productVariant.create({ data: { productId: product.productId, sizeName: "Unconfigured", price: 100 } });
    await db.recipe.createMany({ data: [
      { variantId: variant.variantId, ingredientId: ingredient.ingredientId, quantityNeeded: 2 },
      { variantId: low.variantId, ingredientId: ingredient.ingredientId, quantityNeeded: 20 },
    ] });
    const batch = await db.restockBatch.create({ data: { ingredientId: ingredient.ingredientId, restockedById: actor.id,
      quantityAdded: 10, quantityLeft: 10, costPerUnit: 1, totalCost: 10 } });
    await products.deactivate(product.productId, actor.id);
    expect(await db.productVariant.count({ where: { isAvailable: false, isManuallyDeactivated: true } })).toBe(3);
    await blocked(() => products.activate(product.productId, actor.id));
    expect((await db.product.findFirst()).isAvailable).toBe(false);
    expect(await db.productVariant.count({ where: { isManuallyDeactivated: true } })).toBe(3);
    const result = await products.activate(product.productId, actor.id);
    expect(result.summary.activated).toEqual(["Regular"]);
    expect(result.summary.skipped.sort()).toEqual(["Large", "Unconfigured"]);
    expect((await db.productVariant.findUnique({ where: { variantId: low.variantId } })).isManuallyDeactivated).toBe(true);
    expect((await db.productVariant.findUnique({ where: { variantId: noRecipe.variantId } })).isAvailable).toBe(false);
    await expect(products.activateVariant(product.productId, low.variantId, actor.id)).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });

    // Restocking cannot undo the manual restriction left by the skipped activation.
    await db.restockBatch.update({ where: { restockId: batch.restockId }, data: { quantityAdded: 50, quantityLeft: 50, totalCost: 50 } });
    await db.availabilityRepair.upsert({ where: { variantId: low.variantId }, create: { variantId: low.variantId }, update: {} });
    await createEffectsRepository(db).repairAvailability();
    expect((await db.productVariant.findUnique({ where: { variantId: low.variantId } })).isAvailable).toBe(false);
    expect((await products.activate(product.productId, actor.id)).summary.activated.sort()).toEqual(["Large", "Regular"]);
  }, 60000);
  it("automatic stock recovery restores variants while bulk manual deactivation survives restocking", async () => {
    const ingredient = await db.ingredient.create({ data: { ingredientName: "Fixture milk", unit: "ml", minimumThreshold: 1 } });
    await db.recipe.create({ data: { variantId: variant.variantId, ingredientId: ingredient.ingredientId, quantityNeeded: 20 } });
    const batch = await db.restockBatch.create({ data: { ingredientId: ingredient.ingredientId, restockedById: actor.id,
      quantityAdded: 10, quantityLeft: 10, costPerUnit: 1, totalCost: 10 } });
    const repair = async () => {
      await db.availabilityRepair.upsert({ where: { variantId: variant.variantId }, create: { variantId: variant.variantId }, update: {} });
      await createEffectsRepository(db).repairAvailability();
    };
    await repair();
    expect(await db.productVariant.findUnique({ where: { variantId: variant.variantId } })).toMatchObject({ isAvailable: false, isManuallyDeactivated: false });
    await db.restockBatch.update({ where: { restockId: batch.restockId }, data: { quantityAdded: 50, quantityLeft: 50, totalCost: 50 } });
    await repair();
    expect((await db.productVariant.findUnique({ where: { variantId: variant.variantId } })).isAvailable).toBe(true);
    await products.deactivate(product.productId, actor.id);
    await repair();
    expect(await db.productVariant.findUnique({ where: { variantId: variant.variantId } })).toMatchObject({ isAvailable: false, isManuallyDeactivated: true });
  }, 60000);
  it("history blocks product deletion and renaming, and removal preserves its variant", async () => {
    await db.order.create({ data: { orderNumber: 1, orderDate: new Date("2026-10-04"), customerName: "Fixture", tableNumber: "1", orderSource: "walk_in", createdBy: actor.id,
      items: { create: { productId: product.productId, variantId: variant.variantId, quantity: 1, unitPrice: 85 } } } });
    await expect(products.remove(product.productId, actor.id)).rejects.toMatchObject({ code: "HAS_TRANSACTIONS" });
    await expect(products.updateVariants(product.productId, [{ variant_id: variant.variantId, size_name: "Renamed", price: 85 }], actor.id)).rejects.toMatchObject({ code: "VARIANT_HAS_TRANSACTIONS" });
    await products.updateVariants(product.productId, [{ size_name: "New", price: 100 }], actor.id);
    const old = await db.productVariant.findUnique({ where: { variantId: variant.variantId } });
    expect(old.isManuallyDeactivated).toBe(true); expect(await db.orderItem.count()).toBe(1);
  }, 30000);
  it("image replacement cannot delete the previous image on audit rollback", async () => {
    await db.product.update({ where: { productId: product.productId }, data: { imageUrl: "fixture-old" } });
    await blocked(() => products.update(product.productId, { image_url: "fixture-new" }, actor.id, true));
    expect(deleteImage).not.toHaveBeenCalled(); expect((await db.product.findFirst()).imageUrl).toBe("fixture-old");
    await products.update(product.productId, { image_url: "fixture-new" }, actor.id, true);
    expect(deleteImage).toHaveBeenCalledWith("fixture-old");
  }, 30000);
  it("bundle ensure rolls back location creation if audit capture fails", async () => {
    await blocked(() => categories.ensureBundleSubcategory(actor.id));
    expect(await db.category.count()).toBe(1);
    const result = await categories.ensureBundleSubcategory();
    expect(result.subcategory_name).toBe("Bundle"); expect(await db.domainEffect.count()).toBe(1);
  }, 30000);
  it("staff creation keeps mail outside commit and reports failed delivery", async () => {
    await blocked(() => staff.createStaff({ name: "New", email: "new@fixture.invalid", role: "kitchen" }, actor.id));
    expect(sendEmail).not.toHaveBeenCalled(); expect(await db.user.count()).toBe(2);
    const result = await staff.createStaff({ name: "New", email: "new@fixture.invalid", role: "kitchen" }, actor.id);
    expect(result.emailed).toBe(false); expect(await db.user.count()).toBe(3);
    await deliverAll(); expect(await db.auditLog.count()).toBe(3); expect(await db.notification.count()).toBe(1);
    expect(await db.passwordResetToken.count()).toBe(0);
  }, 30000);
  it("staff update rollback preserves sessions and retry revokes after commit", async () => {
    const work = () => staff.updateStaff(target.id, { name: "Changed" }, actor.id);
    await blocked(work); expect(revokeLocalSessions).not.toHaveBeenCalled();
    expect((await db.user.findUnique({ where: { id: target.id } })).sessionVersion).toBe(0);
    await work(); expect(revokeLocalSessions).toHaveBeenCalledTimes(1);
    expect((await db.user.findUnique({ where: { id: target.id } })).sessionVersion).toBe(1);
  }, 30000);
  it("staff toggle is serialized and audit failure cannot revoke sessions", async () => {
    await blocked(() => staff.toggleActive(target.id, actor.id)); expect(revokeLocalSessions).not.toHaveBeenCalled();
    await Promise.all([staff.toggleActive(target.id, actor.id), staff.toggleActive(target.id, actor.id)]);
    const row = await db.user.findUnique({ where: { id: target.id } }); expect(row.isActive).toBe(true); expect(row.sessionVersion).toBe(2);
    expect(await db.domainEffect.count()).toBe(2); await deliverAll(); expect(await db.notification.count()).toBe(2);
  }, 30000);
  it("staff delete refuses drawer history and rolls back otherwise", async () => {
    await db.shift.create({ data: { openedBy: target.id, openingCash: 100 } });
    await expect(staff.deleteStaff(target.id, actor.id)).rejects.toMatchObject({ code: "STAFF_HAS_TRANSACTIONS" });
    await db.shift.deleteMany(); await blocked(() => staff.deleteStaff(target.id, actor.id));
    expect(revokeLocalSessions).not.toHaveBeenCalled(); expect(await db.user.count()).toBe(2);
    await staff.deleteStaff(target.id, actor.id); expect(await db.user.count()).toBe(1);
    await deliverAll(); expect(await db.auditLog.count()).toBe(1);
  }, 30000);
});
