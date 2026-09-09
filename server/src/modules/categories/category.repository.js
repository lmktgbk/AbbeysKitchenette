import prisma from "../../config/prisma.js";

/**
 * Category Repository
 *
 * Database queries for root categories and subcategories.
 * Two-table model: categories (root) → subcategories → products.
 * Root categories are read-only (managed via SQL).
 * Subcategories are fully managed through the API.
 */
export const categoryRepository = {
  /* ── Categories (roots) ────────────────── */

  /**
   * Find a root category by ID.
   * @param {number} id - category_id
   * @returns {Promise<object|null>}
   */
  async findRootById(id) {
    return prisma.category.findUnique({
      where: { categoryId: id },
    });
  },

  /* ── Subcategories ─────────────────────── */

  /**
   * Find a subcategory by ID.
   * @param {number} id - subcategory_id
   * @returns {Promise<object|null>}
   */
  async findSubcategoryById(id) {
    return prisma.subcategory.findUnique({
      where: { subcategoryId: id },
    });
  },

  /**
   * Find a subcategory by ID with product count.
   * Used to check if a subcategory can be deleted.
   * @param {number} id - subcategory_id
   * @returns {Promise<object|null>}
   */
  async findSubcategoryByIdWithCounts(id) {
    return prisma.subcategory.findUnique({
      where: { subcategoryId: id },
      include: {
        _count: { select: { products: true } },
      },
    });
  },

  /**
   * Create a new subcategory under a root category.
   * @param {object} data - { categoryId, subcategoryName, description? }
   * @returns {Promise<object>}
   */
  async createSubcategory(data) {
    return prisma.subcategory.create({ data });
  },

  /**
   * Update a subcategory's name, description, or active state.
   * @param {number} id - subcategory_id
   * @param {object} data - fields to update
   * @returns {Promise<object>}
   */
  async updateSubcategory(id, data) {
    return prisma.subcategory.update({
      where: { subcategoryId: id },
      data,
    });
  },

  /**
   * Delete a subcategory.
   * Only call after confirming no products reference it.
   * @param {number} id - subcategory_id
   * @returns {Promise<object>}
   */
  async deleteSubcategory(id) {
    return prisma.subcategory.delete({
      where: { subcategoryId: id },
    });
  },

  /* ── Combined ──────────────────────────── */

  /**
   * Get all root categories with their subcategories and product counts.
   * Single query replaces the need for separate root + child fetches.
   * @returns {Promise<Array>}
   */
  async getAllWithSubs() {
    return prisma.category.findMany({
      orderBy: { categoryName: "asc" },
      include: {
        subcategories: {
          orderBy: { subcategoryName: "asc" },
          include: {
            _count: { select: { products: true } },
          },
        },
      },
    });
  },
};
