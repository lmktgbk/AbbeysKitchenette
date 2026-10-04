import { afterEach, expect, it, vi } from "vitest";
import { shiftRepository } from "../src/modules/shifts/shift.repository.js";
import { shiftService } from "../src/modules/shifts/shift.service.js";

afterEach(() => vi.restoreAllMocks());

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
