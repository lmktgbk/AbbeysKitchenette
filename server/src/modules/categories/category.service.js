import { categoryRepository } from "./category.repository.js";
import { productRepository } from "../products/product.repository.js";
import { AppError } from "../../middleware/errorHandler.middleware.js";
import { auditLogService } from "../auditLogs/auditLog.service.js";
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
   * Create a subcategory under a root category.
   * @param {number} categoryId - parent category_id
   * @param {object} data - { subcategory_name, description? }
   * @param {string} userId - admin user performing the action
   * @returns {Promise<object>} - created subcategory
   * @throws {AppError} 404 if parent category not found
   */
  async createSubcategory(categoryId, data, userId) {
    const parent = await categoryRepository.findRootById(categoryId);
    if (!parent) {
      throw new AppError(404, "Parent category not found", "CATEGORY_NOT_FOUND");
    }

    const sub = await categoryRepository.createSubcategory({
      categoryId,
      subcategoryName: data.subcategory_name.trim(),
      description: data.description ?? null,
    });

    auditLogService.logAction({
      userId,
      action: ACTIONS.CATEGORY_CREATED,
      targetType: "subcategory",
      targetId: sub.subcategoryId,
      details: { name: sub.subcategoryName, parent_id: categoryId },
    });

    return toSubcategoryResponse(sub);
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
    const existing = await categoryRepository.findSubcategoryById(id);
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

    const sub = await categoryRepository.updateSubcategory(id, updateData);

    // Deactivate all products under this subcategory when subcategory is turned off
    if (isBeingDeactivated) {
      await this._deactivateProductsBySubcategory(id);
    }

    auditLogService.logAction({
      userId,
      action: ACTIONS.CATEGORY_UPDATED,
      targetType: "subcategory",
      targetId: id,
      details: { name: sub.subcategoryName, is_active: sub.isActive },
    });

    return toSubcategoryResponse(sub);
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
    const existing = await categoryRepository.findSubcategoryByIdWithCounts(id);
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

    await categoryRepository.deleteSubcategory(id);

    auditLogService.logAction({
      userId,
      action: ACTIONS.CATEGORY_DELETED,
      targetType: "subcategory",
      targetId: id,
      details: { name: existing.subcategoryName },
    });
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
  async _deactivateProductsBySubcategory(subcategoryId) {
    const products = await productRepository.findActiveBySubcategory(subcategoryId);
    for (const product of products) {
      await productRepository.update(product.productId, { isAvailable: false });
      await productRepository.deactivateAllVariants(product.productId);
    }
  },
};
