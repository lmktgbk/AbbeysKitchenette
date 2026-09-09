import prisma from "../../config/prisma.js";

/**
 * Guest Repository
 *
 * Public queries for the customer-facing menu.
 * Only returns active, non-archived products with available stock.
 */
export const guestRepository = {
  /**
   * Get available products with variants for the menu.
   * Filters: active products only, non-archived, subcategory active.
   * @param {object} params - { search, category }
   * @returns {Array} - products with variants
   */
  async getAvailableProducts({ search, category }) {
    const where = {
      isAvailable: true,
      isArchived: false,
      subcategory: { isActive: true },
      variants: { some: { recipes: { some: {} } } },
    };

    if (search) {
      where.productName = { contains: search, mode: "insensitive" };
    }

    if (category) {
      where.subcategoryId = Number(category);
    }

    return prisma.product.findMany({
      where,
      include: {
        subcategory: {
          select: {
            subcategoryId: true,
            subcategoryName: true,
            category: { select: { categoryName: true } },
          },
        },
        variants: {
          select: {
            variantId: true,
            sizeName: true,
            price: true,
            isAvailable: true,
          },
          orderBy: { price: "asc" },
        },
      },
      orderBy: { productName: "asc" },
    });
  },
};
