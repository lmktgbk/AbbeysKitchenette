import { beforeEach, describe, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({ product: { count: vi.fn() }, user: { count: vi.fn() }, destroy: vi.fn() }));
vi.mock("../src/config/prisma.js", () => ({ default: fixture }));
vi.mock("../src/config/cloudinary.js", () => ({ default: { uploader: { destroy: fixture.destroy } } }));
vi.mock("../src/config/env.js", () => ({ env: { CLOUDINARY_CLOUD_NAME: "fixture" } }));
import { deleteImage, extractPublicId } from "../src/utils/cloudinary.js";
const url = "https://res.cloudinary.com/fixture/image/upload/v1/abbseys-kitchenette/products/asset.png";
beforeEach(() => {
  vi.clearAllMocks(); fixture.product.count.mockResolvedValue(0); fixture.user.count.mockResolvedValue(0); fixture.destroy.mockResolvedValue({ result: "ok" });
});
describe("reference-safe image cleanup", () => {
  it("deletes only an unreferenced application asset", async () => {
    await deleteImage(url);
    expect(fixture.destroy).toHaveBeenCalledWith("abbseys-kitchenette/products/asset", { resource_type: "image", timeout: 30000 });
  });
  it.each(["product", "user"])("retains an asset referenced by a %s, including ambiguous successful commits", async model => {
    fixture[model].count.mockResolvedValue(1);
    await deleteImage(url); expect(fixture.destroy).not.toHaveBeenCalled();
  });
  it("retains assets when the database cannot confirm their reference state", async () => {
    const log = vi.spyOn(console, "warn").mockImplementation(() => {});
    fixture.product.count.mockRejectedValue(new Error("Database unavailable"));
    await deleteImage(url); expect(fixture.destroy).not.toHaveBeenCalled(); expect(log).toHaveBeenCalled(); log.mockRestore();
  });
  it.each([
    url.replace("res.cloudinary.com", "example.invalid"), url.replace("fixture/image", "other/image"),
    url.replace("products/asset", "private/asset"), url.replace("https:", "http:"), url + "?query=1",
    "https://res.cloudinary.com/fixture/image/upload/../other/asset.png",
  ])("cannot delete arbitrary URLs: %s", async invalid => {
    expect(extractPublicId(invalid)).toBeNull(); await deleteImage(invalid); expect(fixture.destroy).not.toHaveBeenCalled();
  });
});
