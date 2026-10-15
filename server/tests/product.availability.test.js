import { it, expect } from "vitest";
import { variantSellable, variantHasStock } from "../src/modules/products/productAvailability.js";
import { productAvailability, isProductActive } from "../../client/src/features/products/product.utils.js";
const variant = { isAvailable: true, isManuallyDeactivated: false,
  recipes: [{ ingredientId: "milk", quantityNeeded: 100, ingredient: { isArchived: false } }] };

it("requires recipes, usable stock and enabled variant for ordering", () => {
  expect(variantSellable(variant, { milk: 100 })).toBe(true);
  expect(variantSellable(variant, { milk: 99 })).toBe(false);
  expect(variantSellable({ ...variant, isManuallyDeactivated: true }, { milk: 100 })).toBe(false);
  expect(variantSellable({ ...variant, recipes: [] }, { milk: 100 })).toBe(false);
  expect(variantHasStock({ ...variant, recipes: [{ ...variant.recipes[0], ingredient: { isArchived: true } }] }, { milk: 100 })).toBe(false);
});
it("keeps a mixed product available but blocks manual product deactivation", () => {
  const product = { is_available: true, has_active_variant: true, availability_status: "partial", variant_count: 2, available_variant_count: 1 };
  expect(productAvailability(product)).toMatchObject({ active: true, label: "Some variants unavailable", availableCount: 1 });
  expect(isProductActive({ ...product, is_available: false })).toBe(false);
});
it.each([["out_of_stock", "Out of stock"], ["deactivated", "Deactivated"], ["setup_needed", "Setup needed"]])("explains unavailable status %s", (status, label) => {
  expect(productAvailability({ is_available: status !== "deactivated", has_active_variant: false, availability_status: status }).label).toBe(label);
});
