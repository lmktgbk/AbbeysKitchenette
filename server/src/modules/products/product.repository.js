import prisma from "../../config/prisma.js";

/** Get Prisma client or transaction client */
const getClient = (tx) => tx || prisma;

/** Shared recipe include block for variant queries */
const RECIPE_INCLUDE = {
  recipes: {
    include: {
      ingredient: {
        select: { ingredientId: true, ingredientName: true, unit: true },
      },
    },
  },
};

/**
 * Product Repository
 *
 * All database queries related to products.
 * This layer only touches Prisma for product operations.
 */
export const productRepository = {
  /* ── Lookups ─────────────────────────── */

  /**
   * Find a product by name (case-insensitive).
   * "Spanish Latte" and "spAnish Latte" are the same product — the shop
   * must never hold both. Used by create/update/rename duplicate checks.
   * @param {string} name - product name (already trimmed by callers)
   * @returns {object|null} - product or null if not found
   */
  async findByName(name) {
    return prisma.product.findFirst({
      where: { productName: { equals: name, mode: "insensitive" } },
    });
  },

  /**
   * Batch ingredient names for error messages.
   * @param {string[]} ingredientIds - ingredient UUIDs
   * @returns {Map<string, string>} - ingredientId → ingredientName
   */
  async getIngredientNames(ingredientIds) {
    if (ingredientIds.length === 0) return new Map();
    const rows = await prisma.ingredient.findMany({
      where: { ingredientId: { in: ingredientIds } },
      select: { ingredientId: true, ingredientName: true },
    });
    return new Map(rows.map((r) => [r.ingredientId, r.ingredientName]));
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
        subcategory: {
          select: {
            subcategoryId: true,
            subcategoryName: true,
            category: { select: { categoryId: true, categoryName: true } },
          },
        },
        variants: {
          include: RECIPE_INCLUDE,
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
      if (category.startsWith("root:")) {
        const id = Number(category.replace("root:", ""));
        values.push(id);
        clauses.push(`sc.category_id = $${idx++}`);
      } else if (category.startsWith("sub:")) {
        const id = Number(category.replace("sub:", ""));
        values.push(id);
        clauses.push(`p.subcategory_id = $${idx++}`);
      } else {
        const id = Number(category);
        if (!isNaN(id)) {
          values.push(id);
          clauses.push(`sc.category_id = $${idx++}`);
        }
      }
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
        sc.subcategory_id, sc.subcategory_name,
        c.category_id, c.category_name,
        (SELECT COUNT(*)::int FROM product_variants pv WHERE pv.product_id = p.product_id) AS variant_count,
        (SELECT MIN(pv.price) FROM product_variants pv WHERE pv.product_id = p.product_id) AS min_price,
        (SELECT MAX(pv.price) FROM product_variants pv WHERE pv.product_id = p.product_id) AS max_price,
        EXISTS(
          SELECT 1 FROM product_variants pv
          WHERE pv.product_id = p.product_id
            AND pv.is_available = true
            AND EXISTS (
              SELECT 1 FROM recipes r WHERE r.variant_id = pv.variant_id
            )
            AND NOT EXISTS (
              SELECT 1 FROM recipes r
              WHERE r.variant_id = pv.variant_id
                AND COALESCE((
                  SELECT SUM(rb.quantity_left) FROM restock_batches rb
                  WHERE rb.ingredient_id = r.ingredient_id AND rb.quantity_left > 0
                ), 0) < r.quantity_needed
            )
        ) AS has_active_variant
      FROM products p
      LEFT JOIN subcategories sc ON sc.subcategory_id = p.subcategory_id
      LEFT JOIN categories c ON c.category_id = sc.category_id
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
       LEFT JOIN subcategories sc ON sc.subcategory_id = p.subcategory_id
       LEFT JOIN categories c ON c.category_id = sc.category_id
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
        COUNT(*) FILTER (WHERE p.is_available = false)::int AS unavailable,
        (SELECT COUNT(*)::int FROM subcategories)::int AS total_categories
      FROM products p
      WHERE p.is_archived = false
    `;

    return {
      total: result[0].total,
      available: result[0].available,
      unavailable: result[0].unavailable,
      total_categories: result[0].total_categories,
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
    const client = getClient(tx);
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
    const client = getClient(tx);
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
    const client = getClient(tx);
    return client.productVariant.findMany({
      where: { productId },
      include: RECIPE_INCLUDE,
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
    const client = getClient(tx);
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
      include: RECIPE_INCLUDE,
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
      include: RECIPE_INCLUDE,
    });
  },

  /**
   * Deactivate all variants for a product.
   * @param {string} productId - product UUID
   * @param {object} [tx] - optional Prisma transaction client
   * @returns {object} - Prisma batch update result
   */
  async deactivateAllVariants(productId, tx) {
    const client = getClient(tx);
    return client.productVariant.updateMany({
      where: { productId },
      data: { isAvailable: false, isManuallyDeactivated: true },
    });
  },

  /**
   * Activate all variants for a product (clears manual deactivation).
   * @param {string} productId - product UUID
   * @param {object} [tx] - optional Prisma transaction client
   * @returns {object} - Prisma batch update result
   */
  async activateAllVariants(productId, tx) {
    const client = getClient(tx);
    return client.productVariant.updateMany({
      where: { productId },
      data: { isAvailable: true, isManuallyDeactivated: false },
    });
  },

  /**
   * Activate a single variant (clears manual deactivation).
   * @param {string} productId - product UUID
   * @param {number} variantId - variant ID
   * @param {object} [tx] - optional Prisma transaction client
   * @returns {object} - updated variant
   */
  async activateVariant(productId, variantId, tx) {
    const client = getClient(tx);
    return client.productVariant.update({
      where: { variantId: Number(variantId), productId },
      data: { isAvailable: true, isManuallyDeactivated: false },
    });
  },

  /**
   * Deactivate a single variant (marks as manually deactivated).
   * @param {string} productId - product UUID
   * @param {number} variantId - variant ID
   * @param {object} [tx] - optional Prisma transaction client
   * @returns {object} - updated variant
   */
  async deactivateVariant(productId, variantId, tx) {
    const client = getClient(tx);
    return client.productVariant.update({
      where: { variantId: Number(variantId), productId },
      data: { isAvailable: false, isManuallyDeactivated: true },
    });
  },

  /* ── Transaction Checks ── */

  /**
   * Check if a product has any order transactions.
   * Blocks hard-delete of products with order history.
   * @param {string} id - product UUID
   * @returns {number} - order item count referencing this product
   */
  async countTransactions(id) {
    return prisma.orderItem.count({ where: { productId: id } });
  },

  /**
   * Batch-check which variants have transactions.
   * @param {number[]} variantIds - array of variant IDs
   * @returns {Object<number, number>} - map of variantId → transaction count
   */
  async countVariantTransactionsBatch(variantIds) {
    if (variantIds.length === 0) return {};
    const rows = await prisma.orderItem.groupBy({
      by: ["variantId"],
      where: { variantId: { in: variantIds } },
      _count: { variantId: true },
    });
    const result = {};
    for (const id of variantIds) result[id] = 0;
    for (const row of rows) result[row.variantId] = row._count.variantId;
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
    const client = getClient(tx);
    return client.product.delete({
      where: { productId: id },
    });
  },

  /* ── Category Check ──────────────────── */

  /**
   * Check if a subcategory has any active products.
   * @param {number} subcategoryId
   * @returns {boolean}
   */
  async subcategoryHasProducts(subcategoryId) {
    const count = await prisma.product.count({
      where: { subcategoryId, isArchived: false },
    });
    return count > 0;
  },

  /**
   * Find all active, non-archived products under a subcategory.
   * Used by subcategory deactivation to bulk-deactivate products.
   * @param {number} subcategoryId
   * @returns {Promise<Array<{ productId: string }>>}
   */
  async findActiveBySubcategory(subcategoryId) {
    return prisma.product.findMany({
      where: { subcategoryId, isAvailable: true, isArchived: false },
      select: { productId: true },
    });
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
        isManuallyDeactivated: true,
        recipes: {
          select: { ingredientId: true, quantityNeeded: true },
        },
      },
    });
  },

  /**
   * Bulk update isAvailable for multiple variants in ONE statement.
   * Single CASE-based UPDATE — atomic like the old per-row array-tx, but
   * one round-trip regardless of variant count, so it can never expire a
   * 5s transaction the way V sequential updates could.
   * @param {Array<{ variantId: number, isAvailable: boolean }>} updates
   * @returns {number} - rows updated
   */
  async bulkUpdateVariantAvailability(updates) {
    if (updates.length === 0) return 0;
    const result = await prisma.$executeRawUnsafe(`
      UPDATE product_variants
      SET is_available = CASE variant_id ${updates.map((u, i) => `WHEN $${i * 2 + 1} THEN $${i * 2 + 2}`).join(" ")} ELSE is_available END
      WHERE variant_id IN (${updates.map((u, i) => `$${i * 2 + 1}`).join(", ")})
    `, ...updates.flatMap((u) => [u.variantId, u.isAvailable]));
    return result;
  },
};
