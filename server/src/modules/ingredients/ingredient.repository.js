import prisma from "../../config/prisma.js";

/**
 * Ingredient Repository
 *
 * All database queries related to ingredients.
 * This layer only touches Prisma for ingredient operations.
 */
export const ingredientRepository = {
  /* ── Lookups ─────────────────────────── */

  /**
   * Find an ingredient by name.
   * Used to check for duplicate names before creating.
   * @param {string} name - ingredient name
   * @returns {object|null} - ingredient or null if not found
   */
  async findByName(name) {
    return prisma.ingredient.findFirst({
      where: { ingredientName: name },
    });
  },

  /**
   * Find all non-archived ingredients.
   * Ordered by name ascending.
   * @returns {Array<object>} - list of ingredients
   */
  async findAll() {
    return prisma.ingredient.findMany({
      where: { isArchived: false },
      orderBy: { ingredientName: "asc" },
    });
  },

  /**
   * Count ingredients by stock status.
   * Used by the summary endpoint for KPI cards.
   * @returns {{ total: number, healthy: number, low: number, out: number }}
   */
  async countByStatus() {
    const all = await prisma.ingredient.findMany({
      where: { isArchived: false },
      select: { stockQuantity: true, minimumThreshold: true },
    });

    let healthy = 0;
    let low = 0;
    let out = 0;

    for (const i of all) {
      const stock = Number(i.stockQuantity);
      const threshold = Number(i.minimumThreshold);
      if (stock === 0) out++;
      else if (stock <= threshold) low++;
      else healthy++;
    }

    return { total: all.length, healthy, low, out };
  },

  /* ── Mutations ───────────────────────── */

  /**
   * Create a new ingredient.
   * Stock starts at 0, avg cost starts at 0.
   * Admin must restock via POST /:id/restock to add inventory.
   * @param {object} data - { ingredientName, unit, minimumThreshold }
   * @returns {object} - created ingredient
   */
  async create(data) {
    return prisma.ingredient.create({
      data,
    });
  },

  /* ── Single Lookups ──────────────────── */

  /**
   * Find an ingredient by ID.
   * @param {string} id - ingredient UUID
   * @returns {object|null}
   */
  async findById(id) {
    return prisma.ingredient.findUnique({
      where: { ingredientId: id },
    });
  },

  /* ── Archived ────────────────────────── */

  /**
   * Find all archived ingredients.
   * @returns {Array<object>}
   */
  async findArchived() {
    return prisma.ingredient.findMany({
      where: { isArchived: true },
      orderBy: { ingredientName: "asc" },
    });
  },

  /* ── Relationship Checks ─────────────── */

  /**
   * Count total transactions for an ingredient.
   * Includes restock batches, loss records, and stock adjustments.
   * @param {string} id - ingredient UUID
   * @returns {number}
   */
  async countTransactions(id) {
    const [restockCount, lossCount, adjustmentCount] = await Promise.all([
      prisma.restockBatch.count({ where: { ingredientId: id } }),
      prisma.lossRecord.count({ where: { ingredientId: id } }),
      prisma.stockAdjustment.count({ where: { ingredientId: id } }),
    ]);
    return restockCount + lossCount + adjustmentCount;
  },

  /**
   * Check if an ingredient is linked to any product variants via Recipe.
   * @param {string} id - ingredient UUID
   * @returns {boolean}
   */
  async isLinkedToProducts(id) {
    const count = await prisma.recipe.count({
      where: { ingredientId: id },
    });
    return count > 0;
  },

  /* ── Archive & Delete ────────────────── */

  /**
   * Archive an ingredient (soft delete).
   * @param {string} id - ingredient UUID
   * @returns {object}
   */
  async archive(id) {
    return prisma.ingredient.update({
      where: { ingredientId: id },
      data: { isArchived: true },
    });
  },

  /**
   * Restore an archived ingredient.
   * @param {string} id - ingredient UUID
   * @returns {object}
   */
  async restore(id) {
    return prisma.ingredient.update({
      where: { ingredientId: id },
      data: { isArchived: false },
    });
  },

  /**
   * Hard delete an ingredient.
   * @param {string} id - ingredient UUID
   * @returns {object}
   */
  async delete(id) {
    return prisma.ingredient.delete({
      where: { ingredientId: id },
    });
  },
};
