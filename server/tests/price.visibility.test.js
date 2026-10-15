import { it, expect, vi } from "vitest";
vi.mock("../src/config/prisma.js", () => ({ default: { priceOptimization: { findMany: vi.fn() } } }));
import prisma from "../src/config/prisma.js";
import repo from "../src/modules/priceOptimization/priceOptimization.repository.js";

it("keeps applied advice visible and selects latest before hiding dismissed advice", async () => {
  const applied = { id: 10, variantId: 1, status: "accepted" };
  const pending = { id: 11, variantId: 2, status: "pending" };
  prisma.priceOptimization.findMany.mockResolvedValue([applied, pending, { id: 12, variantId: 3, status: "rejected" }]);
  expect(await repo.getPendingSuggestions("product")).toEqual([applied, pending]);
  expect(prisma.priceOptimization.findMany).toHaveBeenCalledWith({
    where: { variant: { productId: "product" } },
    distinct: ["variantId"], orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
});
