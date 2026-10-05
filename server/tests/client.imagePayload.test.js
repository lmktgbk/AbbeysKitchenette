import { describe, expect, it } from "vitest";
import { productPayload } from "../../client/src/features/products/imagePayload.js";
import { PRODUCT_IMAGE_ACCEPT, PRODUCT_IMAGE_MAX_BYTES, productImageError } from "../../client/src/features/products/productValidation.js";
import { IMAGE_POLICIES, checkImageType } from "../src/infrastructure/storage/imageValidation.js";

describe("product image selection policy", () => {
  it.each([["photo.jpg", "image/jpeg"], ["photo.JPEG", "image/jpeg"],
    ["photo.png", "image/png"], ["photo.webp", "image/webp"], ["photo.gif", "image/gif"]])(
    "accepts %s consistently with the backend", (name, type) => {
      expect(productImageError({ name, type, size: 100 })).toBe("");
      expect(() => checkImageType({ originalname: name, mimetype: type }, IMAGE_POLICIES.products.allowed)).not.toThrow();
    });
  it("enforces the same size boundary as backend processing", () => {
    expect(PRODUCT_IMAGE_MAX_BYTES).toBe(IMAGE_POLICIES.products.maxBytes);
    const file = { name: "photo.png", type: "image/png", size: PRODUCT_IMAGE_MAX_BYTES };
    expect(productImageError(file)).toBe("");
    expect(productImageError({ ...file, size: file.size + 1 })).toContain("5 MB");
    expect(productImageError({ ...file, size: 0 })).toContain("empty");
  });
  it.each([["photo.svg", "image/svg+xml"], ["photo.avif", "image/avif"],
    ["photo.png.exe", "image/png"], ["photo.jpg", "image/png"], ["photo", "image/png"]])(
    "rejects unsupported or mismatched metadata for %s", (name, type) => {
      expect(productImageError({ name, type, size: 100 })).not.toBe("");
    });
  it("limits the picker to supported extensions rather than every image format", () => {
    expect(PRODUCT_IMAGE_ACCEPT.split(",").sort()).toEqual([".gif", ".jpeg", ".jpg", ".png", ".webp"]);
  });
});
describe("product save transport", () => {
  it("keeps saves without a new file as JSON", () => {
    expect(productPayload({ product_name: "Fixture", image_file: null })).toEqual({ body: { product_name: "Fixture" }, config: undefined });
  });
  it("sends metadata and image together and overrides Axios's JSON default", () => {
    const image_file = new File(["fixture"], "image.png", { type: "image/png" });
    const { body, config } = productPayload({ product_name: "Fixture", variants: [{ price: 10 }], image_file });
    expect(body.get("image").name).toBe("image.png");
    expect(JSON.parse(body.get("data"))).toEqual({ product_name: "Fixture", variants: [{ price: 10 }] });
    expect(config.headers["Content-Type"]).toBe("multipart/form-data");
  });
});
