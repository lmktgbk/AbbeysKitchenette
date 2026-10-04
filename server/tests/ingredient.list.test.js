import { afterEach, expect, it, vi } from "vitest";
import { ingredientRepository } from "../src/modules/ingredients/ingredient.repository.js";
import { ingredientService } from "../src/modules/ingredients/ingredient.service.js";

const row = {
  ingredient_id: "fixture", ingredient_name: "Coffee", unit: "g",
  stock_quantity: "12.500", minimum_threshold: "2.000", is_archived: false,
  status: "healthy", version: 3, created_at: "created", updated_at: "updated",
};

afterEach(() => vi.restoreAllMocks());

it.each([false, true])("preserves the ingredient list contract (archived=%s)", async archived => {
  const fetch = vi.spyOn(ingredientRepository, archived ? "findManyArchivedPaginated" : "findManyPaginated")
    .mockResolvedValue([{ ...row, is_archived: archived }]);
  vi.spyOn(ingredientRepository, archived ? "countArchivedFiltered" : "countFiltered").mockResolvedValue(1);
  const history = vi.spyOn(ingredientRepository, "countTransactionsBatch").mockResolvedValue({ fixture: 2 });
  const links = vi.spyOn(ingredientRepository, "isLinkedToProductsBatch").mockResolvedValue({ fixture: 0 });

  const result = archived ? await ingredientService.getArchived({}) : await ingredientService.getAll({});

  expect(result).toEqual({ ingredients: [{
    ingredient_id: "fixture", ingredient_name: "Coffee", unit: "g",
    stock_quantity: 12.5, minimum_threshold: 2, is_archived: archived,
    has_transactions: true, is_linked_to_products: false,
    ...(!archived ? { status: "healthy" } : {}),
    version: 3, created_at: "created", updated_at: "updated",
  }], totalItems: 1 });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(history).toHaveBeenCalledExactlyOnceWith(["fixture"]);
  expect(links).toHaveBeenCalledExactlyOnceWith(["fixture"]);
});
