import { it, expect } from "vitest";
import queryClient from "../../client/src/config/queryClient.js";
import { guestKeys } from "../../client/src/features/orders/guestKeys.js";
import { invalidateTopicQueries, productRefreshKeys } from "../../client/src/realtime/queryInvalidation.js";

it("product events invalidate every menu filter without invalidating unrelated tracking", () => {
  const menus = [guestKeys.menu(), guestKeys.menu({ search: "Coffee" }), guestKeys.menu({ category: "2" })];
  const products = ["products", "list"], categories = ["categories"], tracking = guestKeys.order("token");
  for (const key of [...menus, products, categories, tracking]) queryClient.setQueryData(key, { fixture: true });
  invalidateTopicQueries(queryClient, productRefreshKeys);
  for (const key of [...menus, products, categories]) expect(queryClient.getQueryState(key).isInvalidated).toBe(true);
  expect(queryClient.getQueryState(tracking).isInvalidated).toBe(false);
  queryClient.clear();
});
