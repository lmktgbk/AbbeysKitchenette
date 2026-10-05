import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from "vitest";
import crypto from "node:crypto";
vi.mock("../src/config/prisma.js", () => ({ default: {} }));
vi.mock("../src/config/env.js", () => ({ env: {} }));
import { isolatedPostgres } from "./helpers/isolatedPostgres.js";
import { createStorageRepository } from "../src/infrastructure/storage/storage.repository.js";
import { mapPrismaError } from "../src/utils/response.js";
let fixture, db, repo, migrationImages;
const id = crypto.randomUUID(), publicId = "abbseys-kitchenette/avatars/fixture";
const url = `https://res.cloudinary.com/fixture/image/upload/v1/${publicId}.png`;
describe.skipIf(process.env.STORAGE_DB_CHECK !== "1")("PostgreSQL storage ownership and deletion fencing", () => {
  beforeAll(async () => {
    fixture = await isolatedPostgres("storage_check", async (name, connection) => {
      if (name === "20261003090000_storage_assets") await connection.query(
        'INSERT INTO "User" (id, name, email, role, "passwordHash", image_url, "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, now())',
        [id, "Fixture", "fixture@example.invalid", "admin", "unused", url]);
    });
    db = fixture.db; repo = createStorageRepository(db, "fixture"); migrationImages = await db.storageAsset.findMany();
  }, 90000);
  beforeEach(async () => {
    await db.product.deleteMany(); await db.subcategory.deleteMany(); await db.category.deleteMany();
    await db.user.updateMany({ data: { imageUrl: null } }); await db.storageAsset.deleteMany();
    await db.user.deleteMany();
    await db.user.create({ data: { id, name: "Fixture", email: "fixture@example.invalid", role: "admin", passwordHash: "unused" } });
  });
  afterAll(async () => { await fixture?.cleanup(); }, 30000);
  async function ready() { await repo.reserve(publicId, id); await repo.ready(publicId, url); }
  async function due() { await db.storageAsset.updateMany({ data: { nextAttemptAt: new Date(0) } }); }
  it("backfills current images and enables protected ledger/indexes", async () => {
    expect(migrationImages).toHaveLength(1); expect(migrationImages[0]).toMatchObject({ state: "attached", publicId });
    const [row] = await db.$queryRaw`SELECT relrowsecurity FROM pg_class WHERE oid = 'storage_assets'::regclass`;
    expect(row.relrowsecurity).toBe(true);
    const indexes = await db.$queryRaw`SELECT indexname FROM pg_indexes WHERE schemaname = current_schema() AND indexname LIKE '%storage_identity_idx'`;
    expect(indexes).toHaveLength(2);
  });
  it("atomically attaches an upload and queues the previous image on successful replacement", async () => {
    await ready(); await db.user.update({ where: { id }, data: { imageUrl: url } });
    expect((await db.storageAsset.findFirst()).state).toBe("attached"); expect(await repo.claim()).toBeNull();
    await db.user.update({ where: { id }, data: { imageUrl: null } });
    const asset = await repo.claim(); expect(asset.public_id).toBe(publicId); expect(asset.owner).toBeTruthy();
    expect(await repo.finish(asset, true)).toBe(1); expect((await db.storageAsset.findFirst()).state).toBe("deleted");
  });
  it("rolls back the reference and ledger together on a failed save", async () => {
    await ready(); await db.user.update({ where: { id }, data: { imageUrl: url } });
    await expect(db.$transaction(async tx => {
      await tx.user.update({ where: { id }, data: { imageUrl: null } }); throw Error("Fixture failure");
    })).rejects.toThrow("Fixture failure");
    expect((await db.user.findUnique({ where: { id } })).imageUrl).toBe(url);
    expect((await db.storageAsset.findFirst()).state).toBe("attached"); expect(await repo.claim()).toBeNull();
  });
  it("retains another reference even when it uses a different version URL", async () => {
    await ready(); await db.user.update({ where: { id }, data: { imageUrl: url } });
    await db.user.create({ data: { name: "Other", email: "other@example.invalid", role: "admin", passwordHash: "unused", imageUrl: url.replace("/v1/", "/v2/") } });
    await db.user.update({ where: { id }, data: { imageUrl: null } });
    expect(await repo.claim()).toEqual({ retained: true }); expect((await db.storageAsset.findFirst()).state).toBe("attached");
  });
  it("serializes concurrent ownership and fences late attachments", async () => {
    await ready(); await due(); const claims = await Promise.all([repo.claim(), repo.claim()]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    const error = await db.user.update({ where: { id }, data: { imageUrl: url } }).catch(failure => failure);
    expect(error.message).toContain("IMAGE_NOT_AVAILABLE");
    expect(mapPrismaError(error)).toMatchObject({ statusCode: 409, code: "IMAGE_NOT_AVAILABLE" });
    expect((await db.user.findUnique({ where: { id } })).imageUrl).toBeNull();
  });
  it("allows either a committed save or cleanup to win, never both", async () => {
    await ready(); await due();
    const [save, cleanup] = await Promise.allSettled([db.user.update({ where: { id }, data: { imageUrl: url } }), repo.claim()]);
    const image = (await db.user.findUnique({ where: { id } })).imageUrl;
    if (save.status === "fulfilled") { expect(image).toBe(url); expect(cleanup.value?.public_id).toBeUndefined(); }
    else { expect(image).toBeNull(); expect(cleanup.value.public_id).toBe(publicId); }
  });
  it("reclaims crash leases and rejects stale completion", async () => {
    await ready(); await due(); const old = await repo.claim();
    await db.storageAsset.updateMany({ data: { leaseExpiresAt: new Date(0) } }); const current = await repo.claim();
    expect(current.owner).not.toBe(old.owner); expect(await repo.finish(old, true)).toBe(0);
    expect(await repo.finish(current, false)).toBe(1);
    expect((await db.storageAsset.findFirst()).state).toBe("deleting"); expect(await repo.claim()).toBeNull();
    await due(); expect((await repo.claim()).owner).toBeTruthy();
  });
  it("quarantines unknown provider outcomes and accepts a verified late success", async () => {
    await repo.reserve(publicId, id); await due(); expect(await repo.claim()).toEqual({ blocked: true });
    expect((await db.storageAsset.findFirst()).lastError).toBe("UPLOAD_OUTCOME_UNKNOWN");
    await expect(db.user.update({ where: { id }, data: { imageUrl: url } })).rejects.toThrow("IMAGE_NOT_AVAILABLE");
    await repo.ready(publicId, url); await db.user.update({ where: { id }, data: { imageUrl: url } });
    expect((await db.storageAsset.findFirst()).state).toBe("attached");
  });
  it("isolates accounts and enforces unique server-generated asset ownership", async () => {
    await ready(); await due(); expect(await createStorageRepository(db, "other").claim()).toBeNull();
    await expect(repo.reserve(publicId, id)).rejects.toBeDefined();
    await expect(repo.reserve("private/arbitrary", id)).rejects.toBeDefined();
  });
  it("queues product replacement promptly while preserving a shared profile reference", async () => {
    const category = await db.category.create({ data: { categoryName: "Fixture" } });
    const subcategory = await db.subcategory.create({ data: { categoryId: category.categoryId, subcategoryName: "Fixture" } });
    await ready(); const product = await db.product.create({ data: { productName: "Fixture", subcategoryId: subcategory.subcategoryId, imageUrl: url } });
    await db.user.update({ where: { id }, data: { imageUrl: url } });
    await db.product.update({ where: { productId: product.productId }, data: { imageUrl: null } });
    expect(await repo.claim()).toEqual({ retained: true });
    await db.user.update({ where: { id }, data: { imageUrl: null } });
    expect((await repo.claim()).public_id).toBe(publicId);
  });
  it("captures hard product deletion and never allows reuse of a deleted ID", async () => {
    const category = await db.category.create({ data: { categoryName: "Fixture" } });
    const subcategory = await db.subcategory.create({ data: { categoryId: category.categoryId, subcategoryName: "Fixture" } });
    const productId = "abbseys-kitchenette/products/fixture";
    const productUrl = url.replace(publicId, productId);
    await repo.reserve(productId, id); await repo.ready(productId, productUrl);
    const product = await db.product.create({ data: { productName: "Fixture", subcategoryId: subcategory.subcategoryId, imageUrl: productUrl } });
    await db.product.delete({ where: { productId: product.productId } }); const asset = await repo.claim();
    expect(asset.public_id).toBe(productId); await repo.finish(asset, true);
    await expect(db.product.create({ data: { productName: "Next", subcategoryId: subcategory.subcategoryId, imageUrl: productUrl } })).rejects.toThrow("IMAGE_NOT_AVAILABLE");
  });
});
