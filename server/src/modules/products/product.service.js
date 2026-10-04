import { productRepository } from "./product.repository.js";
import { categoryService } from "../categories/category.service.js";
import { AppError } from "../../middleware/errorHandler.middleware.js";
import prisma from "../../config/prisma.js";
import { deleteImage } from "../../utils/cloudinary.js";
import { recordEffects, recordMutation } from "../../services/domainEffects.js";
import { ACTIONS } from "../auditLogs/auditLog.constants.js";

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
    subcategory_id: product.subcategory_id ?? product.subcategoryId,
    subcategory_name: product.subcategory_name ?? product.subcategory?.subcategoryName ?? null,
    category_id: product.category_id ?? product.subcategory?.category?.categoryId ?? null,
    category_name: product.category_name ?? product.subcategory?.category?.categoryName ?? null,
    description: product.description,
    image_url: product.image_url ?? product.imageUrl,
    is_available: product.is_available ?? product.isAvailable,
    is_archived: product.is_archived ?? product.isArchived,
    has_active_variant: product.has_active_variant ?? undefined,
    variant_count: product.variant_count ?? product.variants?.length ?? 0,
    min_price: product.min_price != null ? Number(product.min_price) : undefined,
    max_price: product.max_price != null ? Number(product.max_price) : undefined,
    created_at: product.created_at ?? product.createdAt,
    updated_at: product.updated_at ?? product.updatedAt,
    ...extra,
  };
}

/**
 * Product Service
 *
 * Business logic for product operations.
 * Validates rules, orchestrates repository calls, handles errors.
 */

/** Require a product by ID or throw 404 */
async function requireProduct(id, tx) {
  const product = await productRepository.findById(id, tx);
  if (!product) throw new AppError(404, "Product not found", "PRODUCT_NOT_FOUND");
  return product;
}

/** Require a variant within a product or throw 404 */
function requireVariant(product, variantId) {
  const variant = product.variants.find((v) => v.variantId === Number(variantId));
  if (!variant) throw new AppError(404, "Variant not found", "VARIANT_NOT_FOUND");
  return variant;
}

function productAudit(userId, action, product) {
  return { audit: { userId, action, targetType: "product", targetId: product.productId,
    details: { name: product.productName } } };
}

async function mutateProduct(id, write) {
  return prisma.$transaction(async tx => {
    // Lock the parent before variants; replacement and history checks share this order.
    await tx.$queryRaw`SELECT product_id FROM products WHERE product_id = ${id}::uuid FOR UPDATE`;
    await tx.$queryRaw`SELECT variant_id FROM product_variants WHERE product_id = ${id}::uuid ORDER BY variant_id FOR UPDATE`;
    return write(tx, await requireProduct(id, tx));
  }, { timeout: 5000 });
}

async function variantStock(variants, tx) {
  const ids = [...new Set(variants.flatMap(v => v.recipes.map(r => r.ingredientId)))];
  return productRepository.getStockByIngredientIds(ids, tx);
}

function stockSufficient(variant, stock) {
  return variant.recipes.every(r => !r.ingredient?.isArchived &&
    (stock[r.ingredientId] ?? 0) >= Number(r.quantityNeeded));
}

async function queueVariantRepair(tx, variantIds) {
  if (!variantIds.length) return;
  // Refresh revisions in one round trip; a concurrent stock change stays recoverable.
  await tx.$executeRaw`
    INSERT INTO availability_repairs (variant_id)
    SELECT id FROM unnest(${variantIds}::integer[]) AS id ORDER BY id
    ON CONFLICT (variant_id) DO UPDATE SET revision = gen_random_uuid(), queued_at = clock_timestamp()
  `;
}

export const productService = {
  /**
   * Reject ambiguous variant payloads before any write, with named errors
   * instead of cryptic P2002s:
   * - same ingredient twice on one variant (Butter 5g + Butter 3g) →
   *   400 DUPLICATE_RECIPE_INGREDIENT (DB: @@unique([variantId, ingredientId]))
   * - same size twice on one product (Medium + Medium) →
   *   400 DUPLICATE_VARIANT_SIZE (DB: @@unique([productId, sizeName]))
   * No auto-merge: summing would guess intent on data that drives deductions.
   * @param {Array<object>} variantsData - variants with size_name + recipes
   * @throws {AppError} 400 on either duplication
   */
  async _assertNoDuplicateRecipeLines(variantsData) {
    const dupIds = new Set();
    const seenSizes = new Set();
    let dupSize = null;
    for (const v of variantsData || []) {
      const size = (v.size_name || "").trim().toLowerCase();
      if (size && seenSizes.has(size)) dupSize = dupSize ?? v.size_name;
      seenSizes.add(size);
      const seen = new Set();
      for (const r of v.recipes || []) {
        if (seen.has(r.ingredient_id)) dupIds.add(r.ingredient_id);
        seen.add(r.ingredient_id);
      }
    }
    if (dupSize != null) {
      throw new AppError(
        400,
        `Size "${dupSize}" appears twice — variant sizes must be unique per product`,
        "DUPLICATE_VARIANT_SIZE",
      );
    }
    if (dupIds.size === 0) return;
    const names = await productRepository.getIngredientNames([...dupIds]);
    const label = [...dupIds].map((id) => names.get(id) ?? "An ingredient").join(", ");
    throw new AppError(
      400,
      `${label} appears twice in the recipe — combine it into one line`,
      "DUPLICATE_RECIPE_INGREDIENT",
    );
  },
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
    const product = await requireProduct(id);

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
        is_available: v.isAvailable,
        is_manually_deactivated: v.isManuallyDeactivated ?? false,
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

  /* ── Mutations ───────────────────────── */

  /**
   * Create a new product with variants and recipes in a single transaction.
   * @param {object} data - { product_name, category_id, description?, image_url?, is_available?, variants: [...] }
   * @returns {object} - created product with variants
   * @throws {AppError} 409 if product name already exists
   */
  async create(data, userId, imageUploaded = false) {
    if (data.image_url && !imageUploaded) throw new AppError(400, 'Upload the image with the product', 'INVALID_IMAGE_SOURCE');
    // Step 1: Check for duplicate name
    const existing = await productRepository.findByName(data.product_name.trim());
    if (existing) {
      throw new AppError(409, "A product with that name already exists", "PRODUCT_EXISTS");
    }

    // Step 1b: Bundle promotions carry is_bundle:true instead of a subcategory —
    // auto-assign the system-owned Bundles/Bundle subcategory (find-or-create).
    let subcategoryId = data.subcategory_id;
    if (data.is_bundle && subcategoryId === undefined) {
      const bundleSub = await categoryService.ensureBundleSubcategory(userId);
      subcategoryId = bundleSub.subcategory_id;
    }

    // Step 1c: Reject doubled recipe lines with a named error (not P2002).
    await this._assertNoDuplicateRecipeLines(data.variants);

    // Step 2: Create product + variants + recipes in a transaction
    let product;
    try {
      product = await prisma.$transaction(async (tx) => {
        const newProduct = await productRepository.create(
          {
            productName: data.product_name.trim(),
            subcategoryId,
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

        await recordEffects(tx, productAudit(userId, ACTIONS.PRODUCT_CREATED, newProduct));
        return newProduct;
      }, { timeout: 5000 });
    } catch (err) {
      // Millisecond race: two creates with the same (case-insensitive) name
      // slipped past the pre-check together — the SEC03 index caught it.
      if (err?.code === "P2002") {
        throw new AppError(409, "A product with that name already exists", "PRODUCT_EXISTS");
      }
      throw err;
    }


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
  async update(id, data, userId, imageUploaded = false) {
    // Step 1: Validate product exists
    const existing = await requireProduct(id);

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
    if (data.subcategory_id !== undefined) updateData.subcategoryId = data.subcategory_id;
    if (data.description !== undefined) updateData.description = data.description || null;
    if (data.image_url && data.image_url !== existing.imageUrl && !imageUploaded) {
      throw new AppError(400, 'Upload the image with the product', 'INVALID_IMAGE_SOURCE');
    }
    if (data.image_url !== undefined) {
      updateData.imageUrl = data.image_url || null;
    }
    if (data.is_available !== undefined) updateData.isAvailable = data.is_available;

    // Step 4: Only update if there are changes
    if (Object.keys(updateData).length === 0) {
      throw new AppError(400, "No valid fields to update", "NO_CHANGES");
    }

    try {
      // Compare the prior image atomically so concurrent replacements cannot orphan the winning asset.
      await recordMutation(prisma,
        tx => productRepository.update(id, updateData, tx, updateData.imageUrl !== undefined ? existing.imageUrl : undefined),
        row => productAudit(userId, ACTIONS.PRODUCT_UPDATED, row));
    } catch (error) {
      if (error?.code === 'P2002') throw new AppError(409, 'A product with that name already exists', 'PRODUCT_EXISTS');
      if (error?.code === 'P2025' && updateData.imageUrl !== undefined) throw new AppError(409, 'Product image changed. Refresh and retry.', 'IMAGE_CHANGED');
      throw error;
    }
    if (existing.imageUrl && updateData.imageUrl !== undefined && updateData.imageUrl !== existing.imageUrl) {
      void deleteImage(existing.imageUrl);
    }


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
  async updateVariants(id, variantsData, userId) {

    // Step 1b: Reject doubled recipe lines with a named error (not P2002).
    await this._assertNoDuplicateRecipeLines(variantsData);

    await mutateProduct(id, async (tx, existing) => {
      // Read the replacement diff only after acquiring the product locks.
      const currentVariants = existing.variants;

      // Step 3: Build sets for diffing
      const incomingIds = new Set(
        variantsData.filter((v) => v.variant_id).map((v) => v.variant_id),
      );
      const currentIds = new Set(currentVariants.map((v) => v.variantId));
      if (variantsData.some(v => v.variant_id && !currentIds.has(v.variant_id))) {
        throw new AppError(409, "Variant does not belong to this product or was removed", "VARIANT_CHANGED");
      }

      // Step 4: Find variants to remove (in current but not in incoming)
      const toRemove = currentVariants.filter((v) => !incomingIds.has(v.variantId));

      // Step 5: Batch-check transaction counts for all variants we need to inspect
      const idsToCheck = [
        ...toRemove.map((v) => v.variantId),
        ...variantsData
          .filter((v) => v.variant_id && currentIds.has(v.variant_id))
          .map((v) => v.variant_id),
      ];
      const txMap = await productRepository.countVariantTransactionsBatch(idsToCheck, tx);

      // Step 6: Run all changes in a transaction
      // Handle removals: delete if no transactions, deactivate otherwise
      for (const v of toRemove) {
        if ((txMap[v.variantId] ?? 0) > 0) {
          // Has transactions — deactivate instead of delete
          await tx.productVariant.update({
            where: { variantId: v.variantId },
            data: { isAvailable: false, isManuallyDeactivated: true },
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

          if (isRenaming && (txMap[v.variant_id] ?? 0) > 0) {
            throw new AppError(
              400,
              `Cannot rename variant "${currentVariant.sizeName}" — it has existing orders`,
              "VARIANT_HAS_TRANSACTIONS",
            );
          }

          // Update price, sizeName (if allowed), isAvailable, and replace recipes
          await productRepository.updateVariant(v.variant_id, v, v.recipes || [], tx);
        } else {
          // New variant — create with recipes
          await productRepository.createVariant(id, v, v.recipes || [], tx);
        }
      }
      await recordEffects(tx, productAudit(userId, ACTIONS.PRODUCT_VARIANTS_UPDATED, existing));
    });

    return this.getById(id);
  },

  /**
   * Deactivate a product and all its variants.
   * @param {string} id - product UUID
   * @returns {object} - updated product
   * @throws {AppError} 404 if not found
   */
  async deactivate(id, userId) {
    await mutateProduct(id, async (tx, product) => {
      await productRepository.update(id, { isAvailable: false }, tx);
      await productRepository.deactivateAllVariants(id, tx);
      await recordEffects(tx, productAudit(userId, ACTIONS.PRODUCT_DEACTIVATED, product));
    });
    return this.getById(id);
  },

  async activate(id, userId) {
    const summary = await mutateProduct(id, async (tx, product) => {
      const stock = await variantStock(product.variants, tx);
      const eligible = product.variants.filter(v => v.recipes.length && stockSufficient(v, stock));
      const ids = eligible.map(v => v.variantId);
      await tx.productVariant.updateMany({ where: { productId: id, variantId: { in: ids } },
        data: { isAvailable: true, isManuallyDeactivated: false } });
      await productRepository.update(id, { isAvailable: true }, tx);
      await queueVariantRepair(tx, ids);
      await recordEffects(tx, productAudit(userId, ACTIONS.PRODUCT_ACTIVATED, product));
      return { activated: eligible.map(v => v.sizeName),
        skipped: product.variants.filter(v => !ids.includes(v.variantId)).map(v => v.sizeName) };
    });
    return { product: await this.getById(id), summary };
  },

  async activateVariant(productId, variantId, userId) {
    await mutateProduct(productId, async (tx, product) => {
      const variant = requireVariant(product, variantId);
      if (!stockSufficient(variant, await variantStock([variant], tx))) {
        throw new AppError(400, `Cannot activate variant "${variant.sizeName}" — insufficient stock or archived ingredients`, "INSUFFICIENT_STOCK");
      }
      await productRepository.activateVariant(productId, variantId, tx);
      await productRepository.update(productId, { isAvailable: true }, tx);
      await queueVariantRepair(tx, [variant.variantId]);
      await recordEffects(tx, { audit: { userId, action: ACTIONS.VARIANT_ACTIVATED,
        targetType: "variant", targetId: String(variantId),
        details: { name: product.productName, productId, sizeName: variant.sizeName } } });
    });
    return this.getById(productId);
  },

  async deactivateVariant(productId, variantId, userId) {
    await mutateProduct(productId, async (tx, product) => {
      const variant = requireVariant(product, variantId);
      await productRepository.deactivateVariant(productId, variantId, tx);
      if (!product.variants.some(v => v.variantId !== Number(variantId) && v.isAvailable)) {
        await productRepository.update(productId, { isAvailable: false }, tx);
      }
      await recordEffects(tx, { audit: { userId, action: ACTIONS.VARIANT_DEACTIVATED,
        targetType: "variant", targetId: String(variantId),
        details: { name: product.productName, productId, sizeName: variant.sizeName } } });
    });
    return this.getById(productId);
  },

  async remove(id, userId) {
    const deleted = await mutateProduct(id, async (tx, product) => {
      if (await productRepository.countTransactions(id, tx)) {
        throw new AppError(400, "Cannot delete product with existing transactions. Deactivate instead.", "HAS_TRANSACTIONS");
      }
      const row = await productRepository.delete(id, tx);
      await recordEffects(tx, productAudit(userId, ACTIONS.PRODUCT_DELETED, product));
      return row;
    });
    if (deleted.imageUrl) void deleteImage(deleted.imageUrl);
    return { product_id: id };
  },
};
