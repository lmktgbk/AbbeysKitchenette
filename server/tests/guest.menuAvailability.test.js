import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ menu: vi.fn(), stock: vi.fn() }));
vi.mock("../src/modules/guest/guest.repository.js", () => ({ guestRepository: { getAvailableProducts: mocks.menu } }));
vi.mock("../src/modules/products/product.repository.js", () => ({ productRepository: { getStockByIngredientIds: mocks.stock } }));
vi.mock("../src/modules/orders/order.service.js", () => ({ orderService: {} }));
vi.mock("../src/modules/orders/order.repository.js", () => ({ orderRepository: {} }));
import { guestService } from "../src/modules/guest/guest.service.js";

const variant = { variantId: 1, price: 130, isAvailable: true, isManuallyDeactivated: false,
  recipes: [{ ingredientId: "milk", quantityNeeded: 100, ingredient: { isArchived: false } }] };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.menu.mockResolvedValue([{ productId: "latte", isAvailable: true, variants: [variant] }]);
  mocks.stock.mockResolvedValue({ milk: 100 });
});
it("rejects stale enabled flags when usable stock is insufficient", async () => {
  mocks.stock.mockResolvedValue({ milk: 99 });
  const [menu] = await guestService.getMenu({});
  expect(menu.is_available).toBe(false);
  expect(menu.variants[0].is_available).toBe(false);
  expect(mocks.stock).toHaveBeenCalledExactlyOnceWith(["milk"]);
});
it.each([
  { ...variant, isManuallyDeactivated: true },
  { ...variant, isAvailable: false },
  { ...variant, recipes: [] },
  { ...variant, recipes: [{ ...variant.recipes[0], ingredient: { isArchived: true } }] },
])("keeps blocked variants unavailable despite stock", async blocked => {
  mocks.menu.mockResolvedValue([{ isAvailable: true, variants: [blocked] }]);
  expect((await guestService.getMenu({}))[0].is_available).toBe(false);
});
it("allows a mixed product only when at least one variant is sellable", async () => {
  mocks.menu.mockResolvedValue([{ isAvailable: true, variants: [variant, { ...variant, variantId: 2, isManuallyDeactivated: true }] }]);
  const [menu] = await guestService.getMenu({});
  expect(menu.is_available).toBe(true);
  expect(menu.variants.map(v => v.is_available)).toEqual([true, false]);
});
it("preserves product-level deactivation", async () => {
  mocks.menu.mockResolvedValue([{ isAvailable: false, variants: [variant] }]);
  expect((await guestService.getMenu({}))[0].is_available).toBe(false);
});
