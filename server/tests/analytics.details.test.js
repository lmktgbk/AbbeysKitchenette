import { expect, it, vi } from "vitest";
const query = vi.hoisted(() => vi.fn());
vi.mock("../src/config/prisma.js", () => ({ default: { $queryRawUnsafe: query } }));
import { analyticsRepository } from "../src/modules/analytics/analytics.repository.js";
import { getKpiDetailsQuerySchema } from "../src/modules/analytics/analytics.validation.js";

it("validates drilldown types, dates and page limits", () => {
  expect(getKpiDetailsQuerySchema.safeParse({ kind: "unsafe" }).success).toBe(false);
  expect(getKpiDetailsQuerySchema.safeParse({ kind: "orders", page: "0" }).success).toBe(false);
  expect(getKpiDetailsQuerySchema.safeParse({ kind: "orders", date_from: "2026-10-20", date_to: "2026-10-01" }).success).toBe(false);
});
it("binds period and pagination values instead of interpolating them into SQL", async () => {
  query.mockResolvedValue([{ order_id: "fixture", total: 21 }]);
  expect(await analyticsRepository.getKpiDetails({ kind: "discounts", dateFrom: "2026-10-01", dateTo: "2026-10-14", page: 2 }))
    .toEqual({ rows: [{ order_id: "fixture" }], total: 21, page: 2, limit: 20 });
  const [sql, ...values] = query.mock.calls.at(-1);
  expect(sql).toContain("o.status = 'completed'");
  expect(sql).toContain("o.discount_amount > 0");
  expect(values).toEqual(["2026-10-01", "2026-10-14", 20, 20]);
});
