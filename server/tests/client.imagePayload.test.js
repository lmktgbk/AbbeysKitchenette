import { describe, expect, it } from "vitest";
import { productPayload } from "../../client/src/features/products/imagePayload.js";
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
