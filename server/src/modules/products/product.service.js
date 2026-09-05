import { productRepository } from "./product.repository.js";
import { AppError } from "../../middleware/errorHandler.middleware.js";
import prisma from "../../config/prisma.js";
import { deleteImage } from "../../utils/cloudinary.js";

/**
 * Map Prisma Product or raw SQL row to snake_case API response format.
 * Handles both raw SQL (snake_case keys) and Prisma model (camelCase keys).
 * @param {object} product - Prisma Product record or raw SQL row
 * @param {object} [extra] - additional fields to include
 * @returns {object} - snake_case response object
 */
function mapToProductResponse(product, extra = {}) {
  return {
    product_id: product.product_id ?? product.productId,
    product_name: product.product_name ?? product.productName,
    category_id: product.category_id ?? product.categoryId,
    category_name: product.category_name ?? product.category?.categoryName ?? null,
    description: product.description,
    image_url: product.image_url ?? product.imageUrl,
    is_available: product.is_available ?? product.isAvailable,
    is_archived: product.is_archived ?? product.isArchived,
    variant_count: product.variant_count ?? product.variants?.length ?? 0,
    min_price: product.min_price != null ? Number(product.min_price) : undefined,
    max_price: product.max_price != null ? Number(product.max_price) : undefined,
    created_at: product.created_at ?? product.createdAt,
    updated_at: product.updated_at ?? product.updatedAt,
    ...extra,
  };
}

/**
 * Map a single variant to snake_case with nested recipes.
 * @param {object} variant - Prisma ProductVariant with recipes included
 * @returns {object} - snake_case variant object
 */
function mapToVariantResponse(variant) {
  return {
    variant_id: variant.variantId,
    size_name: variant.sizeName,
    price: Number(variant.price),
    is_available: variant.isAvailable,
    recipes: (variant.recipes || []).map((r) => ({
      recipe_id: r.recipeId,
      ingredient_id: r.ingredientId,
      ingredient_name: r.ingredient?.ingredientName ?? null,
      unit: r.ingredient?.unit ?? null,
      quantity_needed: Number(r.quantityNeeded),
    })),
  };
}

/**
 * Product Service
 *
 * Business logic for product operations.
 * Validates rules, orchestrates repository calls, handles errors.
 */
export const productService = {
  /* ── Queries ─────────────────────────── */

  /**
   * Get all non-archived products with SQL-level pagination, search, category filter, and sort.
   * @param {object} params - { page, limit, search, category, sortBy, sortDir }
   * @returns {{ products: Array, totalItems: number }}
   */
  async getAll({ page = 1, limit = 50, search, category, status = "all", sortBy = "created_at", sortDir = "desc" }) {
    const skip = (page - 1) * limit;

    const [products, totalItems] = await Promise.all([
      productRepository.findManyPaginated({ skip, take: limit, search, category, status, sortBy, sortDir }),
      productRepository.countFiltered({ search, category, status }),
    ]);

    const enriched = products.map((p) => mapToProductResponse(p));
    return { products: enriched, totalItems };
  },

  /**
   * Get product status counts for KPI cards.
   * @returns {object} - { total, available, unavailable, categories_used }
   */
  async getSummary() {
    return productRepository.countByStatus();
  },

  /**
   * Get a single product with variants and recipes.
   * @param {string} id - product UUID
   * @returns {object} - product with variants
   * @throws {AppError} 404 if not found
   */
  async getById(id) {
    const product = await productRepository.findById(id);
    if (!product) {
      throw new AppError(404, "Product not found", "PRODUCT_NOT_FOUND");
    }

    const variantIds = product.variants.map((v) => v.variantId);
    const txMap = await productRepository.countVariantTransactionsBatch(variantIds);

    // Collect all unique ingredient IDs across all variants
    const allIngredientIds = [
      ...new Set(
        product.variants.flatMap((v) =>
          (v.recipes || []).map((r) => r.ingredientId)
        )
      ),
    ];
    const stockMap = await productRepository.getStockByIngredientIds(allIngredientIds);

    const variants = product.variants.map((v) => {
      const recipes = (v.recipes || []).map((r) => ({
        recipe_id: r.recipeId,
        ingredient_id: r.ingredientId,
        ingredient_name: r.ingredient?.ingredientName ?? null,
        unit: r.ingredient?.unit ?? null,
        quantity_needed: Number(r.quantityNeeded),
      }));

      // Compute stock sufficiency: ALL ingredients must have enough stock
      const is_stock_sufficient =
        recipes.length > 0 &&
        recipes.every((r) => stockMap[r.ingredient_id] >= r.quantity_needed);

      return {
        variant_id: v.variantId,
        size_name: v.sizeName,
        price: Number(v.price),
        has_transactions: txMap[v.variantId] > 0,
        is_stock_sufficient,
        recipes,
      };
    });

    const prices = variants.map((v) => v.price).filter((p) => p > 0);

    return {
      ...mapToProductResponse(product),
      min_price: prices.length > 0 ? Math.min(...prices) : null,
      max_price: prices.length > 0 ? Math.max(...prices) : null,
      variants,
    };
  },

  /* ── Variant Availability Recompute ──── */

  /**
   * Recompute is_available for all variants that use the given ingredients.
   * Called after restock, loss, order deduction, or order cancellation.
   * @param {string[]} ingredientIds - ingredient UUIDs that changed stock
   */
  async recomputeVariantAvailability(ingredientIds) {
    if (!ingredientIds || ingredientIds.length === 0) return;

    // Step 1: Find all variants affected by these ingredients
    const variants = await productRepository.findVariantsByIngredientIds(ingredientIds);
    if (variants.length === 0) return;

    // Step 2: Get current stock for all involved ingredients
    const allIngredientIds = [...new Set(
      variants.flatMap((v) => v.recipes.map((r) => r.ingredientId))
    )];
    const stockMap = await productRepository.getStockByIngredientIds(allIngredientIds);

    // Step 3: Compute new isAvailable for each variant
    const updates = variants.map((v) => {
      const isAvailable =
        v.recipes.length > 0 &&
        v.recipes.every((r) => (stockMap[r.ingredientId] ?? 0) >= Number(r.quantityNeeded));
      return { variantId: v.variantId, isAvailable };
    });

    // Step 4: Bulk update
    await productRepository.bulkUpdateVariantAvailability(updates);
  },

  /* ── Mutations ───────────────────────── */

  /**
   * Create a new product with variants and recipes in a single transaction.
   * @param {object} data - { product_name, category_id, description?, image_url?, is_available?, variants: [...] }
   * @returns {object} - created product with variants
   * @throws {AppError} 409 if product name already exists
   */
  async create(data) {
    // Step 1: Check for duplicate name
    const existing = await productRepository.findByName(data.product_name.trim());
    if (existing) {
      throw new AppError(409, "A product with that name already exists", "PRODUCT_EXISTS");
    }

    // Step 2: Create product + variants + recipes in a transaction
    const product = await prisma.$transaction(async (tx) => {
      const newProduct = await productRepository.create(
        {
          productName: data.product_name.trim(),
          categoryId: data.category_id,
          description: data.description || null,
          imageUrl: data.image_url || null,
          isAvailable: data.is_available ?? true,
        },
        tx,
      );

      // Create each variant with its recipes
      for (const v of data.variants) {
        await productRepository.createVariant(
          newProduct.productId,
          v,
          v.recipes || [],
          tx,
        );
      }

      return newProduct;
    });

    // Step 3: Return full product with variants
    return this.getById(product.productId);
  },

  /**
   * Update product info only (not variants).
   * @param {string} id - product UUID
   * @param {object} data - { product_name?, category_id?, description?, image_url?, is_available? }
   * @returns {object} - updated product
   * @throws {AppError} 404 if not found, 409 if duplicate name
   */
  async update(id, data) {
    // Step 1: Validate product exists
    const existing = await productRepository.findById(id);
    if (!existing) {
      throw new AppError(404, "Product not found", "PRODUCT_NOT_FOUND");
    }

    const updateData = {};

    // Step 2: If name is changing, check for duplicates
    if (data.product_name !== undefined) {
      const trimmedName = data.product_name.trim();
      if (trimmedName !== existing.productName) {
        const duplicate = await productRepository.findByName(trimmedName);
        if (duplicate) {
          throw new AppError(409, "A product with that name already exists", "PRODUCT_EXISTS");
        }
        updateData.productName = trimmedName;
      }
    }

    // Step 3: Map other fields
    if (data.category_id !== undefined) updateData.categoryId = data.category_id;
    if (data.description !== undefined) updateData.description = data.description || null;
    if (data.image_url !== undefined) {
      // Delete old Cloudinary image if replacing or removing
      if (existing.imageUrl && data.image_url !== existing.imageUrl) {
        await deleteImage(existing.imageUrl);
      }
      updateData.imageUrl = data.image_url || null;
    }
    if (data.is_available !== undefined) updateData.isAvailable = data.is_available;

    // Step 4: Only update if there are changes
    if (Object.keys(updateData).length === 0) {
      throw new AppError(400, "No valid fields to update", "NO_CHANGES");
    }

    await productRepository.update(id, updateData);
    return this.getById(id);
  },

  /**
   * Replace all variants for a product atomically.
   * - Variants with variant_id → update (price, isAvailable, recipes)
   * - Variants without variant_id → create
   * - Existing variants not in request → delete (if no tx) or deactivate (if has tx)
   * @param {string} id - product UUID
   * @param {Array<object>} variantsData - array of variant objects
   * @returns {object} - updated product with variants
   * @throws {AppError} 404 if not found
   */
  async updateVariants(id, variantsData) {
    // Step 1: Validate product exists
    const existing = await productRepository.findById(id);
    if (!existing) {
      throw new AppError(404, "Product not found", "PRODUCT_NOT_FOUND");
    }

    // Step 2: Get current variants for diff
    const currentVariants = await productRepository.findVariantsByProductId(id);

    // Step 3: Build sets for diffing
    const incomingIds = new Set(
      variantsData.filter((v) => v.variant_id).map((v) => v.variant_id),
    );
    const currentIds = new Set(currentVariants.map((v) => v.variantId));

    // Step 4: Find variants to remove (in current but not in incoming)
    const toRemove = currentVariants.filter((v) => !incomingIds.has(v.variantId));

    // Step 5: Run all changes in a transaction
    await prisma.$transaction(async (tx) => {
      // Handle removals: delete if no transactions, deactivate otherwise
      for (const v of toRemove) {
        const txCount = await productRepository.countVariantTransactions(v.variantId);
        if (txCount > 0) {
          // Has transactions — deactivate instead of delete
          await tx.productVariant.update({
            where: { variantId: v.variantId },
            data: { isAvailable: false },
          });
        } else {
          // No transactions — safe to delete (cascade removes recipes)
          await tx.productVariant.delete({
            where: { variantId: v.variantId },
          });
        }
      }

      // Handle creates and updates
      for (const v of variantsData) {
        if (v.variant_id && currentIds.has(v.variant_id)) {
          // Existing variant — check if size_name rename is allowed
          const currentVariant = currentVariants.find(
            (cv) => cv.variantId === v.variant_id,
          );
          const isRenaming =
            v.size_name !== undefined && v.size_name !== currentVariant.sizeName;

          if (isRenaming) {
            const txCount =
              await productRepository.countVariantTransactions(v.variant_id);
            if (txCount > 0) {
              throw new AppError(
                400,
                `Cannot rename variant "${currentVariant.sizeName}" — it has existing orders`,
                "VARIANT_HAS_TRANSACTIONS",
              );
            }
          }

          // Update price, sizeName (if allowed), isAvailable, and replace recipes
          await productRepository.updateVariant(v.variant_id, v, v.recipes || [], tx);
        } else {
          // New variant — create with recipes
          await productRepository.createVariant(id, v, v.recipes || [], tx);
        }
      }
    });

    return this.getById(id);
  },

  /**
   * Deactivate a product and all its variants.
   * @param {string} id - product UUID
   * @returns {object} - updated product
   * @throws {AppError} 404 if not found
   */
  async deactivate(id) {
    const existing = await productRepository.findById(id);
    if (!existing) {
      throw new AppError(404, "Product not found", "PRODUCT_NOT_FOUND");
    }

    await prisma.$transaction(async (tx) => {
      await productRepository.update(id, { isAvailable: false }, tx);
      await productRepository.deactivateAllVariants(id, tx);
    });

    return this.getById(id);
  },

  /**
   * Activate a product (does NOT auto-activate variants).
   * @param {string} id - product UUID
   * @returns {object} - updated product
   * @throws {AppError} 404 if not found
   */
  async activate(id) {
    const existing = await productRepository.findById(id);
    if (!existing) {
      throw new AppError(404, "Product not found", "PRODUCT_NOT_FOUND");
    }

    await productRepository.update(id, { isAvailable: true });
    return this.getById(id);
  },

  /**
   * Permanently delete a product and all its variants/recipes.
   * @param {string} id - product UUID
   * @returns {object} - confirmation
   * @throws {AppError} 404 if not found, 400 if has transactions
   */
  async remove(id) {
    const existing = await productRepository.findById(id);
    if (!existing) {
      throw new AppError(404, "Product not found", "PRODUCT_NOT_FOUND");
    }

    // Check for transactions (placeholder — always 0 for now)
    const txCount = await productRepository.countTransactions(id);
    if (txCount > 0) {
      throw new AppError(
        400,
        "Cannot delete product with existing transactions. Deactivate instead.",
        "HAS_TRANSACTIONS",
      );
    }

    // Hard delete (cascades to variants and recipes)
    // Delete Cloudinary image first
    if (existing.imageUrl) {
      await deleteImage(existing.imageUrl);
    }
    await productRepository.delete(id);
    return { product_id: id };
  },
};
