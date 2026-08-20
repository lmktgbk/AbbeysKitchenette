import prisma from "../../config/prisma.js";

/**
 * Category Repository
 *
 * All database queries related to categories.
 * This layer only touches Prisma for category operations.
 */
export const categoryRepository = {
  /* ── Lookups ─────────────────────────── */

  /**
   * Find all categories with product counts.
   * Ordered by sortOrder ascending, then by name.
   * @returns {Array<object>} - categories with product counts
   */
  async findAll() {
    return prisma.category.findMany({
      orderBy: [{ sortOrder: "asc" }, { categoryName: "asc" }],
      include: {
        _count: { select: { products: true } },
      },
    });
  },

  /**
   * Find a category by ID.
   * @param {number} id - category ID
   * @returns {object|null} - category or null if not found
   */
  async findById(id) {
    return prisma.category.findUnique({
      where: { categoryId: id },
    });
  },

  /**
   * Find a category by ID with product count.
   * Used for delete protection check.
   * @param {number} id - category ID
   * @returns {object|null} - category with product count or null
   */
  async findByIdWithProductCount(id) {
    return prisma.category.findUnique({
      where: { categoryId: id },
      include: {
        _count: { select: { products: true } },
      },
    });
  },

  /* ── Mutations ───────────────────────── */

  /**
   * Create a new category.
   * @param {object} data - { categoryName, description?, sortOrder? }
   * @returns {object} - created category
   */
  async create(data) {
    return prisma.category.create({
      data,
    });
  },

  /**
   * Update an existing category.
   * @param {number} id - category ID
   * @param {object} data - fields to update
   * @returns {object} - updated category
   */
  async update(id, data) {
    return prisma.category.update({
      where: { categoryId: id },
      data,
    });
  },

  /**
   * Delete a category.
   * Only called after confirming no products reference it.
   * @param {number} id - category ID
   */
  async delete(id) {
    return prisma.category.delete({
      where: { categoryId: id },
    });
  },
};
