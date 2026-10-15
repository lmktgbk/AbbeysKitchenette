import { it, expect } from "vitest";
import { createProductSchema, updateVariantsSchema, updateProductSchema } from "../src/modules/products/product.validation.js";
const variant = { size_name: "Regular", price: 100,
  recipes: [{ ingredient_id: "00000000-0000-4000-8000-000000000001", quantity_needed: 100 }] };
const create = variants => ({ product_name: "Fixture", subcategory_id: 1, variants });

it.each([createProductSchema, updateVariantsSchema])("rejects missing or empty recipes in every submitted variant", schema => {
  for (const recipes of [undefined, [], null]) {
    const result = schema.safeParse(create([variant, { ...variant, size_name: "Large", recipes }]));
    expect(result.success).toBe(false);
    expect(result.error.issues[0].path).toEqual(["variants", 1, "recipes"]);
    expect(result.error.issues[0].message).toBe("At least one ingredient is required");
  }
});
it("accepts complete create/replacement payloads and keeps metadata edits independent", () => {
  expect(createProductSchema.safeParse(create([variant])).success).toBe(true);
  expect(updateVariantsSchema.safeParse({ variants: [{ ...variant, variant_id: 1 }] }).success).toBe(true);
  expect(updateProductSchema.safeParse({ product_name: "Renamed" }).success).toBe(true);
  expect(createProductSchema.safeParse({ product_name: "Bundle", is_bundle: true, variants: [variant] }).success).toBe(true);
});
