import { it, expect } from "vitest";
import { sidebarCounts } from "../../client/src/layouts/admin/sidebarCounts.js";

it("counts only actionable statuses with no badges for forecasting or promotions", () => {
  const counts = sidebarCounts({ products: { unavailable: 3 }, inventory: { low: 2, out: 4 },
    orders: { pending: 1, accepted: 2, preparing: 3, completed: 100, cancelled: 50 },
    anomalies: { total: 7, bySeverity: { critical: 1 } }, shifts: { count: 2 } });
  expect(counts).toEqual({ "/products": 3, "/inventory": 6, "/orders": 6, "/anomalies": 7, "/staff": 2 });
  expect(counts["/forecasting"]).toBeUndefined(); expect(counts["/promotions"]).toBeUndefined();
});
it("does not invent counts for missing or invalid responses", () => {
  expect(Object.values(sidebarCounts({})).every(v => v === undefined)).toBe(true);
  expect(sidebarCounts({ products: { unavailable: -1 } })["/products"]).toBeUndefined();
});
