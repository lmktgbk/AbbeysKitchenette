import { categoryRepository } from "./category.repository.js";
import prisma from "../../config/prisma.js";
import { AppError } from "../../middleware/errorHandler.middleware.js";
import { recordEffects } from "../../infrastructure/effects/effects.js";
import { ACTIONS } from "../auditLogs/auditLog.constants.js";

// ── Response Helpers (DRY) ──────────────────────────────

/**
 * Format a root category with its subcategories for API response.
 * @param {object} cat - Prisma Category with subcategories included
 * @returns {object} - snake_case response object
 */
function toCategoryResponse(cat) {
  return {
    category_id: cat.categoryId,
    category_name: cat.categoryName,
    description: cat.description,
    subcategories: (cat.subcategories || []).map(toSubcategoryResponse),
    created_at: cat.createdAt,
    updated_at: cat.updatedAt,
  };
}

/**
 * Format a subcategory for API response.
 * @param {object} sub - Prisma Subcategory with _count.products included
 * @returns {object} - snake_case response object
 */
function toSubcategoryResponse(sub) {
  return {
    subcategory_id: sub.subcategoryId,
    subcategory_name: sub.subcategoryName,
    description: sub.description,
    is_active: sub.isActive,
    category_id: sub.categoryId,
    product_count: sub._count?.products ?? 0,
    created_at: sub.createdAt,
    updated_at: sub.updatedAt,
  };
}

/**
 * Category Service
 *
 * Business logic for category and subcategory operations.
 * Two-table model: categories (root) → subcategories → products.
 * Root categories are read-only (managed via SQL).
 * Subcategories are fully managed through the API.
 */
export const categoryService = {
  /* ── Queries ─────────────────────────── */

  /**
   * Get all root categories with their subcategories.
   * @returns {Promise<Array>} - formatted categories with nested subcategories
   */
  async getAll() {
    const categories = await categoryRepository.getAllWithSubs();
    return categories.map(toCategoryResponse);
  },

  /* ── Subcategory Mutations ──────────── */

  /**
   * System-owned Bundle location for promotion-created combo products.
   * Root "Bundles" is SQL-managed like Food/Beverages; sub "Bundle" is auto-created.
   * Race-safe: unique constraints (Category.categoryName, Subcategory[categoryId, subcategoryName])
   * turn concurrent ensures into a refetch instead of duplicates.
   */
  BUNDLE_ROOT_NAME: "Bundles",
  BUNDLE_SUB_NAME: "Bundle",

  /**
   * Find-or-create the Bundles/Bundle subcategory for promotion combos.
   * Creates the root too when missing (fresh DBs where roots were never seeded via SQL).
   * WHY upserts: find-then-create races under concurrent submits (create hits P2002
   * while the winner's row is still uncommitted, then the refetch misses it and the
   * caller crashes on null). Upsert resolves the conflict atomically server-side.
   * @param {string|null} [userId] - admin attributed in the audit log on auto-create
   * @returns {Promise<object>} - subcategory response with subcategory_id
   * @throws {AppError} 500 BUNDLE_ENSURE_FAILED if the location cannot be resolved
   */
  async ensureBundleSubcategory(userId = null) {
    return prisma.$transaction(async tx => {
      let root;
      let sub;
      try {
        root = await categoryRepository.upsertRootByName(
          categoryService.BUNDLE_ROOT_NAME,
          "System-owned root for promotion bundle products", tx,
        );
        sub = await categoryRepository.upsertSub(
          root.categoryId,
          categoryService.BUNDLE_SUB_NAME,
          "Auto-created for promotion bundle products", tx,
        );
      } catch (err) {
        console.error("[bundle] Failed to ensure Bundles/Bundle location:", err?.message ?? err);
        throw new AppError(500, "Could not resolve Bundle category. Please try again.", "BUNDLE_ENSURE_FAILED");
      }
      if (!root || !sub) {
        console.error("[bundle] Bundle location resolved to null after upsert.");
        throw new AppError(500, "Could not resolve Bundle category. Please try again.", "BUNDLE_ENSURE_FAILED");
      }

      await recordEffects(tx, { audit: {
        userId: userId ?? undefined,
        action: ACTIONS.CATEGORY_CREATED,
        targetType: "subcategory",
        targetId: String(sub.subcategoryId),
        details: { name: sub.subcategoryName, parent_id: root.categoryId, auto: "bundle-ensure" },
      } });

      return toSubcategoryResponse(sub);
    }, { timeout: 5000 });
  },

  /**
   * Create a subcategory under a root category.
   * @param {number} categoryId - parent category_id
   * @param {object} data - { subcategory_name, description? }
   * @param {string} userId - admin user performing the action
   * @returns {Promise<object>} - created subcategory
   * @throws {AppError} 404 if parent category not found
   */
  async createSubcategory(categoryId, data, userId) {
    return prisma.$transaction(async tx => {
      const parent = await categoryRepository.findRootById(categoryId, tx);
      if (!parent) {
        throw new AppError(404, "Parent category not found", "CATEGORY_NOT_FOUND");
      }

      const sub = await categoryRepository.createSubcategory({
        categoryId,
        subcategoryName: data.subcategory_name.trim(),
        description: data.description ?? null,
      }, tx);

      await recordEffects(tx, { audit: {
        userId: userId ?? undefined,
        action: ACTIONS.CATEGORY_CREATED,
        targetType: "subcategory",
        targetId: String(sub.subcategoryId),
        details: { name: sub.subcategoryName, parent_id: categoryId },
      } });

      return toSubcategoryResponse(sub);
    }, { timeout: 5000 });
  },

  /**
   * Update a subcategory's name, description, or active state.
   * When is_active is toggled OFF, all products under it become unavailable.
   * When toggled ON, products stay as-is (user must manually reactivate).
   * @param {number} id - subcategory_id
   * @param {object} data - { subcategory_name?, description?, is_active? }
   * @param {string} userId - admin user performing the action
   * @returns {Promise<object>} - updated subcategory
   * @throws {AppError} 404 if not found
   */
  async updateSubcategory(id, data, userId) {
    return prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT subcategory_id FROM subcategories WHERE subcategory_id = ${id} FOR UPDATE`;
      const existing = await categoryRepository.findSubcategoryById(id, tx);
      if (!existing) {
        throw new AppError(404, "Subcategory not found", "SUBCATEGORY_NOT_FOUND");
      }

      const updateData = {};
      if (data.subcategory_name !== undefined) updateData.subcategoryName = data.subcategory_name.trim();
      if (data.description !== undefined) updateData.description = data.description;

      // Toggle product availability when subcategory is deactivated
      const wasActive = existing.isActive;
      const isBeingDeactivated = data.is_active === false && wasActive;

      if (data.is_active !== undefined) updateData.isActive = data.is_active;

      const sub = await categoryRepository.updateSubcategory(id, updateData, tx);

      // Deactivate all products under this subcategory when subcategory is turned off
      if (isBeingDeactivated) {
        await this._deactivateProductsBySubcategory(id, tx);
      }

      await recordEffects(tx, { audit: {
        userId: userId ?? undefined,
        action: ACTIONS.CATEGORY_UPDATED,
        targetType: "subcategory",
        targetId: String(id),
        details: { name: sub.subcategoryName, is_active: sub.isActive },
      } });

      return toSubcategoryResponse(sub);
    }, { timeout: 5000 });
  },

  /**
   * Delete a subcategory.
   * Blocked if it has products.
   * @param {number} id - subcategory_id
   * @param {string} userId - admin user performing the action
   * @returns {Promise<void>}
   * @throws {AppError} 404 if not found, 400 if has products
   */
  async removeSubcategory(id, userId) {
    return prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT subcategory_id FROM subcategories WHERE subcategory_id = ${id} FOR UPDATE`;
      const existing = await categoryRepository.findSubcategoryByIdWithCounts(id, tx);
      if (!existing) {
        throw new AppError(404, "Subcategory not found", "SUBCATEGORY_NOT_FOUND");
      }

      if (existing._count.products > 0) {
        throw new AppError(
          400,
          "Cannot delete subcategory with existing products. Reassign or remove products first.",
          "SUBCATEGORY_HAS_PRODUCTS",
        );
      }

      await categoryRepository.deleteSubcategory(id, tx);

      await recordEffects(tx, { audit: {
        userId: userId ?? undefined,
        action: ACTIONS.CATEGORY_DELETED,
        targetType: "subcategory",
        targetId: String(id),
        details: { name: existing.subcategoryName },
      } });
    }, { timeout: 5000 });
  },

  /* ── Internal Helpers ────────────────── */

  /**
   * Deactivate all products under a subcategory.
   * Sets isAvailable=false and deactivates all variants.
   * Called when a subcategory's is_active is toggled OFF.
   * @param {number} subcategoryId
   * @returns {Promise<void>}
   * @private
   */
  async _deactivateProductsBySubcategory(subcategoryId, tx) {
    // The category service supplies its mutation transaction: product/variant
    // availability and category audit must not commit independently.
    // Two set-based writes replace two round trips per product.
    await tx.product.updateMany({ where: { subcategoryId }, data: { isAvailable: false } });
    await tx.productVariant.updateMany({ where: { product: { subcategoryId } },
      data: { isAvailable: false, isManuallyDeactivated: true } });
  },
};
