import { beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ db: null }));
vi.mock("../src/config/prisma.js", () => ({ default: new Proxy({}, { get: (_target, key) => h.db[key] }) }));
vi.mock("../src/config/env.js", () => ({ env: { NODE_ENV: "test", JWT_SECRET: "fixture-secret-at-least-thirty-two-characters" } }));
vi.mock("../src/infrastructure/storage/imageCleanup.js", () => ({ deleteImage: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../src/infrastructure/integrations/email.js", () => ({ sendEmail: vi.fn(), generateOtpEmail: vi.fn(), generateResetPasswordEmail: vi.fn() }));
vi.mock("../src/modules/auditLogs/auditLog.service.js", () => ({ auditLogService: { logAction: vi.fn().mockResolvedValue({}) } }));
import { productService } from "../src/modules/products/product.service.js";
import { productRepository } from "../src/modules/products/product.repository.js";
import { authService } from "../src/modules/auth/auth.service.js";
import { authRepository } from "../src/modules/auth/auth.repository.js";
import { deleteImage } from "../src/infrastructure/storage/imageCleanup.js";
beforeEach(() => {
  vi.restoreAllMocks(); vi.clearAllMocks();
  h.db = { $queryRaw: async () => [], domainEffect: { create: vi.fn().mockResolvedValue({}) } };
  h.db.$transaction = async write => write(h.db);
});
const previous = "https://fixture.invalid/old.png", next = "https://fixture.invalid/new.png";
describe("image persistence ordering", () => {
  it("a failed product save leaves the previous asset untouched", async () => {
    vi.spyOn(productRepository, "findById").mockResolvedValue({ productId: "id", imageUrl: previous });
    vi.spyOn(productRepository, "update").mockRejectedValue(new Error("Database failure"));
    await expect(productService.update("id", { image_url: next }, "00000000-0000-4000-8000-000000000001", true)).rejects.toThrow("Database failure");
    expect(deleteImage).not.toHaveBeenCalled();
  });
  it("a stale product replacement returns a conflict and does not delete the current asset", async () => {
    vi.spyOn(productRepository, "findById").mockResolvedValue({ productId: "id", imageUrl: previous });
    vi.spyOn(productRepository, "update").mockRejectedValue({ code: "P2025" });
    await expect(productService.update("id", { image_url: next }, "00000000-0000-4000-8000-000000000001", true)).rejects.toMatchObject({ statusCode: 409, code: "IMAGE_CHANGED" });
    expect(deleteImage).not.toHaveBeenCalled();
  });
  it("cleanup follows the product commit and compares the previously read image", async () => {
    vi.spyOn(productRepository, "findById").mockResolvedValue({ productId: "id", imageUrl: previous });
    const save = vi.spyOn(productRepository, "update").mockImplementation(async (_id, _data, _tx, expectedImage) => {
      expect(expectedImage).toBe(previous); expect(deleteImage).not.toHaveBeenCalled(); return { productId: "id", productName: "Fixture", imageUrl: next };
    });
    vi.spyOn(productService, "getById").mockResolvedValue({ image_url: next });
    expect(await productService.update("id", { image_url: next }, "00000000-0000-4000-8000-000000000001", true)).toEqual({ image_url: next });
    expect(save).toHaveBeenCalled(); expect(deleteImage).toHaveBeenCalledWith(previous);
  });
  it("cannot attach an arbitrary or previously deleted asset through JSON", async () => {
    vi.spyOn(productRepository, "findById").mockResolvedValue({ imageUrl: previous });
    await expect(productService.update("id", { image_url: next }, "admin")).rejects.toMatchObject({ code: "INVALID_IMAGE_SOURCE" });
    await expect(productService.create({ image_url: next }, "admin")).rejects.toMatchObject({ code: "INVALID_IMAGE_SOURCE" });
  });
  it("hard delete cleans the image returned by the delete, including an intervening replacement", async () => {
    vi.spyOn(productRepository, "findById").mockResolvedValue({ productId: "id", productName: "Fixture", imageUrl: previous });
    vi.spyOn(productRepository, "countTransactions").mockResolvedValue(0);
    vi.spyOn(productRepository, "delete").mockImplementation(async () => { expect(deleteImage).not.toHaveBeenCalled(); return { productId: "id", productName: "Fixture", imageUrl: next }; });
    await productService.remove("id", "00000000-0000-4000-8000-000000000001"); expect(deleteImage).toHaveBeenCalledWith(next);
  });
  it.each([new Error("Database failure"), { code: "P2025" }])("a failed avatar replacement retains its old image", async failure => {
    vi.spyOn(authRepository, "findById").mockResolvedValue({ imageUrl: previous });
    vi.spyOn(authRepository, "updateImageUrl").mockRejectedValue(failure);
    await expect(authService.uploadProfileImage("user", next)).rejects.toBeDefined(); expect(deleteImage).not.toHaveBeenCalled();
  });
  it("avatar cleanup follows a conditional database update", async () => {
    vi.spyOn(authRepository, "findById").mockResolvedValue({ imageUrl: previous });
    vi.spyOn(authRepository, "updateImageUrl").mockImplementation(async (_user, url, expectedImage) => {
      expect(expectedImage).toBe(previous); expect(deleteImage).not.toHaveBeenCalled(); return { imageUrl: url };
    });
    expect(await authService.uploadProfileImage("user", next)).toEqual({ imageUrl: next }); expect(deleteImage).toHaveBeenCalledWith(previous);
  });
});
