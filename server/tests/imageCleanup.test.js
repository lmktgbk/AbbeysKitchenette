import { beforeEach, describe, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({ schedule: vi.fn(), wake: vi.fn() }));
vi.mock("../src/services/storageAssets.repository.js", () => ({ storageRepository: { schedule: fixture.schedule } }));
vi.mock("../src/services/storageAssets.worker.js", () => ({ storageWorker: { wake: fixture.wake } }));
vi.mock("../src/config/env.js", () => ({ env: { CLOUDINARY_CLOUD_NAME: "fixture" } }));
import { deleteImage, extractPublicId } from "../src/utils/cloudinary.js";
import { mapPrismaError } from "../src/utils/response.js";
const url = "https://res.cloudinary.com/fixture/image/upload/v1/abbseys-kitchenette/products/asset.png";
beforeEach(() => {
  vi.clearAllMocks(); fixture.schedule.mockReset().mockResolvedValue(undefined);
});
describe("reference-safe image cleanup", () => {
  it("maps only the image lifecycle database guard to a clear conflict", () => {
    expect(mapPrismaError({ code: "P2039", message: "IMAGE_NOT_AVAILABLE" })).toMatchObject({ statusCode: 409, code: "IMAGE_NOT_AVAILABLE" });
    expect(mapPrismaError({ code: "P2039", message: "Unrelated check constraint" })).toBeNull();
  });
  it("schedules a validated asset and wakes background cleanup without inline provider deletion", async () => {
    await deleteImage(url);
    expect(fixture.schedule).toHaveBeenCalledWith("abbseys-kitchenette/products/asset"); expect(fixture.wake).toHaveBeenCalledTimes(1);
  });
  it("does not start cleanup if durable scheduling fails", async () => {
    const log = vi.spyOn(console, "warn").mockImplementation(() => {});
    fixture.schedule.mockRejectedValue(new Error("Database unavailable"));
    await deleteImage(url); expect(fixture.wake).not.toHaveBeenCalled(); expect(log).toHaveBeenCalled(); log.mockRestore();
  });
  it.each([
    url.replace("res.cloudinary.com", "example.invalid"), url.replace("fixture/image", "other/image"),
    url.replace("products/asset", "private/asset"), url.replace("https:", "http:"), url + "?query=1",
    "https://res.cloudinary.com/fixture/image/upload/../other/asset.png",
  ])("cannot delete arbitrary URLs: %s", async invalid => {
    expect(extractPublicId(invalid)).toBeNull(); await deleteImage(invalid); expect(fixture.schedule).not.toHaveBeenCalled();
  });
});
