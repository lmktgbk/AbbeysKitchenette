import { ingredientRepository } from "./ingredient.repository.js";
import { AppError } from "../../middleware/errorHandler.middleware.js";

/**
 * Ingredient Service
 *
 * Business logic for ingredient operations.
 * Validates rules, orchestrates repository calls, handles errors.
 */
export const ingredientService = {
  /* ── Queries ─────────────────────────── */

  /**
   * Get all non-archived ingredients.
   * Returns snake_case fields for frontend consistency.
   * Decimal fields are converted to JS numbers for easier client handling.
   * @returns {Array<object>} - list of ingredients
   */
  async getAll() {
    const ingredients = await ingredientRepository.findAll();

    const enriched = await Promise.all(
      ingredients.map(async (i) => {
        const txCount = await ingredientRepository.countTransactions(i.ingredientId);
        const linked = await ingredientRepository.isLinkedToProducts(i.ingredientId);

        return {
          ingredient_id: i.ingredientId,
          ingredient_name: i.ingredientName,
          unit: i.unit,
          stock_quantity: Number(i.stockQuantity),
          minimum_threshold: Number(i.minimumThreshold),
          is_archived: i.isArchived,
          has_transactions: txCount > 0,
          is_linked_to_products: linked,
          version: i.version,
          created_at: i.createdAt,
          updated_at: i.updatedAt,
        };
      }),
    );

    return enriched;
  },

  /**
   * Get ingredient status counts for KPI cards.
   * Returns { total, healthy, low, out }.
   * @returns {object} - status summary
   */
  async getSummary() {
    return ingredientRepository.countByStatus();
  },

  /* ── Mutations ───────────────────────── */

  /**
   * Create a new ingredient.
   * Stock starts at 0 — admin must restock via POST /:id/restock to add inventory.
   * Rejects duplicate ingredient names (case-insensitive check).
   * @param {object} data - { ingredient_name, unit, minimum_threshold? }
   * @returns {object} - created ingredient in snake_case
   * @throws {AppError} 409 if ingredient name already exists
   */
  async create(data) {
    // Check for duplicate name
    const existing = await ingredientRepository.findByName(
      data.ingredient_name.trim(),
    );

    if (existing) {
      throw new AppError(
        409,
        "An ingredient with that name already exists",
        "INGREDIENT_EXISTS",
      );
    }

    const ingredient = await ingredientRepository.create({
      ingredientName: data.ingredient_name.trim(),
      unit: data.unit.trim(),
      stockQuantity: 0,
      minimumThreshold: data.minimum_threshold ?? 0,
    });

    return {
      ingredient_id: ingredient.ingredientId,
      ingredient_name: ingredient.ingredientName,
      unit: ingredient.unit,
      stock_quantity: Number(ingredient.stockQuantity),
      minimum_threshold: Number(ingredient.minimumThreshold),
      is_archived: ingredient.isArchived,
      version: ingredient.version,
      created_at: ingredient.createdAt,
      updated_at: ingredient.updatedAt,
    };
  },

  /* ── Archived ────────────────────────── */

  /**
   * Get all archived ingredients with transaction flags.
   * @returns {Array<object>}
   */
  async getArchived() {
    const ingredients = await ingredientRepository.findArchived();

    const enriched = await Promise.all(
      ingredients.map(async (i) => {
        const txCount = await ingredientRepository.countTransactions(i.ingredientId);
        const linked = await ingredientRepository.isLinkedToProducts(i.ingredientId);

        return {
          ingredient_id: i.ingredientId,
          ingredient_name: i.ingredientName,
          unit: i.unit,
          stock_quantity: Number(i.stockQuantity),
          minimum_threshold: Number(i.minimumThreshold),
          is_archived: i.isArchived,
          has_transactions: txCount > 0,
          is_linked_to_products: linked,
          version: i.version,
          created_at: i.createdAt,
          updated_at: i.updatedAt,
        };
      }),
    );

    return enriched;
  },

  /* ── Archive & Delete ────────────────── */

  /**
   * Archive an ingredient.
   * Rejects if ingredient is linked to products.
   * @param {string} id - ingredient UUID
   * @returns {object}
   * @throws {AppError} 404 if not found
   * @throws {AppError} 400 if linked to products
   */
  async archive(id) {
    const ingredient = await ingredientRepository.findById(id);
    if (!ingredient) {
      throw new AppError(404, "Ingredient not found", "INGREDIENT_NOT_FOUND");
    }

    const linked = await ingredientRepository.isLinkedToProducts(id);
    if (linked) {
      throw new AppError(
        400,
        "Cannot archive ingredient that is linked to products",
        "LINKED_TO_PRODUCTS",
      );
    }

    const archived = await ingredientRepository.archive(id);
    return {
      ingredient_id: archived.ingredientId,
      ingredient_name: archived.ingredientName,
      is_archived: archived.isArchived,
    };
  },

  /**
   * Restore an archived ingredient.
   * @param {string} id - ingredient UUID
   * @returns {object}
   * @throws {AppError} 404 if not found
   */
  async restore(id) {
    const ingredient = await ingredientRepository.findById(id);
    if (!ingredient) {
      throw new AppError(404, "Ingredient not found", "INGREDIENT_NOT_FOUND");
    }

    const restored = await ingredientRepository.restore(id);
    return {
      ingredient_id: restored.ingredientId,
      ingredient_name: restored.ingredientName,
      is_archived: restored.isArchived,
    };
  },

  /**
   * Permanently delete an ingredient.
   * Rejects if ingredient has any transactions.
   * @param {string} id - ingredient UUID
   * @returns {object}
   * @throws {AppError} 404 if not found
   * @throws {AppError} 400 if has transactions
   */
  async delete(id) {
    const ingredient = await ingredientRepository.findById(id);
    if (!ingredient) {
      throw new AppError(404, "Ingredient not found", "INGREDIENT_NOT_FOUND");
    }

    const txCount = await ingredientRepository.countTransactions(id);
    if (txCount > 0) {
      throw new AppError(
        400,
        "Cannot delete ingredient with transaction history",
        "HAS_TRANSACTIONS",
      );
    }

    await ingredientRepository.delete(id);
    return { ingredient_id: id };
  },
};
