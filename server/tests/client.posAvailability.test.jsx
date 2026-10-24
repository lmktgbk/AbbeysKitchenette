import React from "../../client/node_modules/react/index.js";
import { renderToStaticMarkup } from "../../client/node_modules/react-dom/server.node.js";
import { expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ products: [], fetching: false, error: false }));
vi.mock("../../client/src/features/orders/query.js", () => ({
  useGuestMenu: () => ({ data: { data: { menu: mocks.products } }, isFetching: mocks.fetching, isError: mocks.error }),
  usePendingOnlineOrders: () => ({ data: {} }),
}));
vi.mock("../../client/src/components/ui/dialog.jsx", () => ({
  Dialog: () => null, DialogContent: () => null, DialogHeader: () => null,
  DialogTitle: () => null, DialogClose: () => null,
}));
vi.mock("../../client/src/components/ui/icon.jsx", () => ({ default: () => null }));
import PosMenuGrid from "../../client/src/features/orders/components/PosMenuGrid.jsx";
it("keeps the catalog visible without a loading overlay during background refreshes", () => {
  mocks.products = [{ product_id: "background", product_name: "Current Latte", is_available: true,
    variants: [{ variant_id: 9, price: 130, is_available: true }] }];
  mocks.fetching = true;
  const html = renderToStaticMarkup(<PosMenuGrid />);
  expect(html).toContain("Current Latte");
  expect(html).not.toContain("absolute inset-0");
  mocks.fetching = false;
});
it("still asks for a retry when the menu cannot be refreshed", () => {
  mocks.error = true;
  const html = renderToStaticMarkup(<PosMenuGrid />);
  expect(html).toContain("Retry menu");
  expect(html).not.toContain("Current Latte");
  mocks.error = false;
});
it("sorts categories A–Z after All and disables unavailable cards", () => {
  mocks.products = [
    { product_id: "1", product_name: "Tea", subcategory_id: 2, subcategory_name: "Tea", is_available: false,
      variants: [{ variant_id: 1, price: 130, is_available: true }] },
    { product_id: "2", product_name: "Latte", subcategory_id: 1, subcategory_name: "Coffee", is_available: true,
      variants: [{ variant_id: 2, price: 130, is_available: true }] },
  ];
  const html = renderToStaticMarkup(<PosMenuGrid />);
  const labels = [...html.matchAll(/<button[^>]*>(All|Coffee|Tea)<\/button>/g)].map(m => m[1]);
  expect(labels).toEqual(["All", "Coffee", "Tea"]);
  expect(html).toMatch(/<button[^>]*disabled=""[^>]*>[\s\S]*?Tea/);
  expect(html).toContain("Unavailable");
});
