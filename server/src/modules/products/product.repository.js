import prisma from "../../config/prisma.js";

/**
 * Product Repository
 *
 * All database queries related to products.
 * This layer only touches Prisma for product operations.
 */
export const productRepository = {
  /* ── Lookups ─────────────────────────── */

  /**
   * Find a product by name.
   * Used to check for duplicate names before creating.
   * @param {string} name - product name
   * @returns {object|null} - product or null if not found
   */
  async findByName(name) {
    return prisma.product.findFirst({
      where: { productName: name },
    });
  },

  /**
   * Find a product by ID with variants, recipes, and category.
   * @param {string} id - product UUID
   * @returns {object|null}
   */
  async findById(id) {
    return prisma.product.findUnique({
      where: { productId: id },
      include: {
        category: { select: { categoryId: true, categoryName: true } },
        variants: {
          include: {
            recipes: {
              include: {
                ingredient: {
                  select: { ingredientId: true, ingredientName: true, unit: true },
                },
              },
            },
          },
          orderBy: { variantId: "asc" },
        },
      },
    });
  },

  /* ── Paginated Queries (SQL-Level) ──── */

  /**
   * Build WHERE clause for non-archived products.
   * @param {string} search - search term
   * @param {string} category - category ID filter
   * @param {string} status - availability filter: all, active, unavailable
   * @returns {{ where: string, values: Array }}
   */
  _buildActiveWhereClause(search, category, status) {
    const clauses = ["p.is_archived = false"];
    const values = [];
    let idx = 1;

    if (search) {
      values.push(`%${search}%`);
      clauses.push(`p.product_name ILIKE $${idx++}`);
    }

    if (category) {
      values.push(Number(category));
      clauses.push(`p.category_id = $${idx++}`);
    }

    if (status === "active") {
      clauses.push("p.is_available = true");
    } else if (status === "unavailable") {
      clauses.push("p.is_available = false");
    }

    return { where: `WHERE ${clauses.join(" AND ")}`, values };
  },

  _buildActiveOrderByClause(sortBy, sortDir) {
    const dir = sortDir === "desc" ? "DESC" : "ASC";
    const sortMap = {
      product_name: `p.product_name ${dir}`,
      category_name: `c.category_name ${dir}`,
      created_at: `p.created_at ${dir}`,
    };
    return sortMap[sortBy] || `p.created_at DESC`;
  },

  async findManyPaginated({ skip, take, search, category, status, sortBy, sortDir }) {
    const { where, values } = this._buildActiveWhereClause(search, category, status);
    const orderBy = this._buildActiveOrderByClause(sortBy, sortDir);

    return prisma.$queryRawUnsafe(
      `SELECT
        p.product_id, p.product_name, p.description, p.image_url,
        p.is_available, p.is_archived, p.created_at, p.updated_at,
        c.category_id, c.category_name,
        (SELECT COUNT(*)::int FROM product_variants pv WHERE pv.product_id = p.product_id) AS variant_count,
        (SELECT MIN(pv.price) FROM product_variants pv WHERE pv.product_id = p.product_id) AS min_price,
        (SELECT MAX(pv.price) FROM product_variants pv WHERE pv.product_id = p.product_id) AS max_price
      FROM products p
      LEFT JOIN categories c ON c.category_id = p.category_id
      ${where}
      ORDER BY ${orderBy}
      LIMIT ${take} OFFSET ${skip}`,
      ...values
    );
  },

  async countFiltered({ search, category, status }) {
    const { where, values } = this._buildActiveWhereClause(search, category, status);
    const result = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS count FROM products p
       LEFT JOIN categories c ON c.category_id = p.category_id
       ${where}`,
      ...values
    );
    return result[0]?.count ?? 0;
  },

  /**
   * Count products by availability status for KPI cards.
   * @returns {{ total: number, available: number, unavailable: number, categoriesUsed: number }}
   */
  async countByStatus() {
    const result = await prisma.$queryRaw`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE p.is_available = true)::int AS available,
        COUNT(*) FILTER (WHERE p.is_available = false)::int AS unavailable
      FROM products p
      WHERE p.is_archived = false
    `;

    const categoriesUsed = await prisma.$queryRaw`
      SELECT COUNT(DISTINCT p.category_id)::int AS count
      FROM products p
      WHERE p.is_archived = false
    `;

    return {
      total: result[0].total,
      available: result[0].available,
      unavailable: result[0].unavailable,
      categories_used: categoriesUsed[0].count,
    };
  },

  /* ── Mutations ───────────────────────── */

  /**
   * Create a new product.
   * @param {object} data - { productName, categoryId, description?, imageUrl?, isAvailable? }
   * @param {object} [tx] - optional Prisma transaction client
   * @returns {object} - created product
   */
  async create(data, tx) {
    const client = tx || prisma;
    return client.product.create({ data });
  },

  /**
   * Update product info (name, category, description, image, availability).
   * @param {string} id - product UUID
   * @param {object} data - fields to update
   * @param {object} [tx] - optional Prisma transaction client
   * @returns {object} - updated product
   */
  async update(id, data, tx) {
    const client = tx || prisma;
    return client.product.update({
      where: { productId: id },
      data,
    });
  },

  /* ── Variants ────────────────────────── */

  /**
   * Find all variants for a product with their recipes.
   * @param {string} productId - product UUID
   * @param {object} [tx] - optional Prisma transaction client
   * @returns {Array<object>}
   */
  async findVariantsByProductId(productId, tx) {
    const client = tx || prisma;
    return client.productVariant.findMany({
      where: { productId },
      include: {
        recipes: {
          include: {
            ingredient: {
              select: { ingredientId: true, ingredientName: true, unit: true },
            },
          },
        },
      },
      orderBy: { variantId: "asc" },
    });
  },

  /**
   * Delete all variants for a product (cascade deletes recipes).
   * @param {string} productId - product UUID
   * @param {object} [tx] - optional Prisma transaction client
   * @returns {object} - Prisma batch delete result
   */
  async deleteVariantsByProductId(productId, tx) {
    const client = tx || prisma;
    return client.productVariant.deleteMany({
      where: { productId },
    });
  },

  /**
   * Create a variant with its recipes in a transaction.
   * @param {string} productId - product UUID
   * @param {object} variantData - { sizeName, price, isAvailable }
   * @param {Array<object>} recipes - [{ ingredientId, quantityNeeded }]
   * @param {object} tx - Prisma transaction client
   * @returns {object} - created variant with recipes
   */
  async createVariant(productId, variantData, recipes, tx) {
    return tx.productVariant.create({
      data: {
        productId,
        sizeName: variantData.size_name,
        price: variantData.price,
        isAvailable: variantData.is_available ?? true,
        recipes: {
          create: recipes.map((r) => ({
            ingredientId: r.ingredient_id,
            quantityNeeded: r.quantity_needed,
          })),
        },
      },
      include: {
        recipes: {
          include: {
            ingredient: {
              select: { ingredientId: true, ingredientName: true, unit: true },
            },
          },
        },
      },
    });
  },

  /**
   * Update an existing variant's size_name, price, and availability.
   * Deletes old recipes and creates new ones.
   * @param {number} variantId - variant ID
   * @param {object} variantData - { size_name, price, is_available }
   * @param {Array<object>} recipes - [{ ingredientId, quantityNeeded }]
   * @param {object} tx - Prisma transaction client
   * @returns {object} - updated variant with recipes
   */
  async updateVariant(variantId, variantData, recipes, tx) {
    // Delete existing recipes for this variant
    await tx.recipe.deleteMany({ where: { variantId } });

    const updateData = {
      price: variantData.price,
      recipes: {
        create: recipes.map((r) => ({
          ingredientId: r.ingredient_id,
          quantityNeeded: r.quantity_needed,
        })),
      },
    };

    // Only update sizeName if provided (allows rename for variants without orders)
    if (variantData.size_name !== undefined) {
      updateData.sizeName = variantData.size_name;
    }

    return tx.productVariant.update({
      where: { variantId },
      data: updateData,
      include: {
        recipes: {
          include: {
            ingredient: {
              select: { ingredientId: true, ingredientName: true, unit: true },
            },
          },
        },
      },
    });
  },

  /**
   * Deactivate all variants for a product.
   * @param {string} productId - product UUID
   * @param {object} [tx] - optional Prisma transaction client
   * @returns {object} - Prisma batch update result
   */
  async deactivateAllVariants(productId, tx) {
    const client = tx || prisma;
    return client.productVariant.updateMany({
      where: { productId },
      data: { isAvailable: false },
    });
  },

  /* ── Transaction Checks (Placeholder) ── */

  /**
   * Check if a product has any order transactions.
   * Placeholder — always returns 0 until Order module is built.
   * @param {string} id - product UUID
   * @returns {number} - transaction count (0 for now)
   */
  async countTransactions(id) {
    // TODO: Replace with real check when Order module is built
    // Example: return prisma.orderItem.count({ where: { variant: { productId: id } } });
    return 0;
  },

  /**
   * Check if a variant has any order transactions.
   * Placeholder — always returns 0 until Order module is built.
   * @param {number} variantId - variant ID
   * @returns {number} - transaction count (0 for now)
   */
  async countVariantTransactions(variantId) {
    // TODO: Replace with real check when Order module is built
    return 0;
  },

  /**
   * Batch-check which variants have transactions.
   * Placeholder — returns empty map until Order module is built.
   * @param {number[]} variantIds - array of variant IDs
   * @returns {Object<number, number>} - map of variantId → transaction count
   */
  async countVariantTransactionsBatch(variantIds) {
    if (variantIds.length === 0) return {};
    // TODO: Replace with real check when Order module is built
    const result = {};
    for (const id of variantIds) result[id] = 0;
    return result;
  },

  /* ── Stock Computation ───────────────── */

  /**
   * Batch-fetch current stock for multiple ingredients.
   * Returns a map of ingredientId → total stock from active restock batches.
   * @param {string[]} ingredientIds - array of ingredient UUIDs
   * @returns {Object<string, number>} - map of ingredientId → stock
   */
  async getStockByIngredientIds(ingredientIds) {
    if (ingredientIds.length === 0) return {};
    const result = await prisma.restockBatch.groupBy({
      by: ["ingredientId"],
      where: {
        ingredientId: { in: ingredientIds },
        quantityLeft: { gt: 0 },
      },
      _sum: { quantityLeft: true },
    });
    const stockMap = {};
    for (const id of ingredientIds) stockMap[id] = 0;
    for (const row of result) stockMap[row.ingredientId] = Number(row._sum.quantityLeft ?? 0);
    return stockMap;
  },

  /* ── Delete ──────────────────────────── */

  /**
   * Hard delete a product (cascades to variants and recipes via schema).
   * @param {string} id - product UUID
   * @param {object} [tx] - optional Prisma transaction client
   * @returns {object}
   */
  async delete(id, tx) {
    const client = tx || prisma;
    return client.product.delete({
      where: { productId: id },
    });
  },

  /* ── Category Check ──────────────────── */

  /**
   * Check if a category has any active products.
   * @param {number} categoryId
   * @returns {boolean}
   */
  async categoryHasProducts(categoryId) {
    const count = await prisma.product.count({
      where: { categoryId, isArchived: false },
    });
    return count > 0;
  },

  /* ── Variant Availability Recompute ──── */

  /**
   * Find all variants that use any of the given ingredients (via recipes).
   * Used by recomputeVariantAvailability to determine which variants are affected.
   * @param {string[]} ingredientIds - array of ingredient UUIDs
   * @returns {Array<object>} - variants with their recipes
   */
  async findVariantsByIngredientIds(ingredientIds) {
    if (ingredientIds.length === 0) return [];
    return prisma.productVariant.findMany({
      where: {
        recipes: { some: { ingredientId: { in: ingredientIds } } },
      },
      select: {
        variantId: true,
        productId: true,
        recipes: {
          select: { ingredientId: true, quantityNeeded: true },
        },
      },
    });
  },

  /**
   * Bulk update isAvailable for multiple variants in a single transaction.
   * @param {Array<{ variantId: number, isAvailable: boolean }>} updates
   */
  async bulkUpdateVariantAvailability(updates) {
    if (updates.length === 0) return;
    await prisma.$transaction(
      updates.map((u) =>
        prisma.productVariant.update({
          where: { variantId: u.variantId },
          data: { isAvailable: u.isAvailable },
        })
      )
    );
  },
};
