import { afterEach, expect, it, vi } from "vitest";
import { shiftRepository } from "../src/modules/shifts/shift.repository.js";
import { shiftService } from "../src/modules/shifts/shift.service.js";

afterEach(() => vi.restoreAllMocks());

// Match the history filter contract, including unbounded and Manila calendar-day ranges.
it.each([
  [{}, null, null],
  [{ dateFrom: "2026-10-06", dateTo: "2026-10-06" }, "2026-10-05T16:00:00.000Z", "2026-10-06T15:59:59.999Z"],
  [{ dateFrom: "2026-10-01", dateTo: "2026-10-06" }, "2026-09-30T16:00:00.000Z", "2026-10-06T15:59:59.999Z"],
  [{ dateFrom: "2026-10-01" }, "2026-09-30T16:00:00.000Z", null],
  [{ dateTo: "2026-10-06" }, null, "2026-10-06T15:59:59.999Z"],
])("shift KPIs use the selected date bounds: %j", async (params, from, to) => {
  const query = vi.spyOn(shiftRepository, "getStats").mockResolvedValue({ sessions: 3, cashSales: 100 });
  const result = await shiftService.getStats(params);
  expect(query).toHaveBeenCalledExactlyOnceWith(from ? new Date(from) : null, to ? new Date(to) : null);
  expect(result).toMatchObject({ sessions: 3, cashSales: 100, date_from: params.dateFrom || null, date_to: params.dateTo || null });
});

const readers = ["getById", "getSummary", "getShiftOrders", "getIngredientUsage"];

it.each(readers)("%s rejects another cashier's drawer", async method => {
  const find = vi.spyOn(shiftRepository, "findById").mockResolvedValue({ shiftId: "drawer", openedBy: "owner" });
  await expect(shiftService[method]("drawer", { userId: "other", role: "cashier" }))
    .rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
  expect(find).toHaveBeenCalledExactlyOnceWith("drawer");
});

it.each(readers)("%s retains the missing drawer response", async method => {
  vi.spyOn(shiftRepository, "findById").mockResolvedValue(null);
  await expect(shiftService[method]("missing", { userId: "owner", role: "admin" }))
    .rejects.toMatchObject({ statusCode: 404, code: "SHIFT_NOT_FOUND" });
});

it.each(["cashier", "admin"])("detail allows the owner or an admin (%s)", async role => {
  vi.spyOn(shiftRepository, "findById").mockResolvedValue({ shiftId: "drawer", openedBy: "owner", status: "open" });
  const summary = vi.spyOn(shiftService, "buildSummary").mockResolvedValue({ expected_cash: 100 });
  const result = await shiftService.getById("drawer", { userId: role === "admin" ? "admin" : "owner", role });
  expect(result).toMatchObject({ shift_id: "drawer", expected_cash: 100 });
  expect(summary).toHaveBeenCalledTimes(1);
});
