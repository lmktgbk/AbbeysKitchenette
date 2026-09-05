import { categoryRepository } from "./category.repository.js";
import { AppError } from "../../middleware/errorHandler.middleware.js";
import { auditLogService } from "../auditLogs/auditLog.service.js";
import { ACTIONS } from "../auditLogs/auditLog.constants.js";

/**
 * Category Service
 *
 * Business logic for category operations.
 * Validates rules, orchestrates repository calls, handles errors.
 */
export const categoryService = {
  /* ── Queries ─────────────────────────── */

  /**
   * Get all categories with product counts.
   * @returns {Array<object>} - list of categories
   */
  async getAll() {
    const categories = await categoryRepository.findAll();

    return categories.map((cat) => ({
      category_id: cat.categoryId,
      category_name: cat.categoryName,
      description: cat.description,
      sort_order: cat.sortOrder,
      is_active: cat.isActive,
      product_count: cat._count.products,
      created_at: cat.createdAt,
      updated_at: cat.updatedAt,
    }));
  },

  /**
   * Get a single category by ID.
   * @param {number} id - category ID
   * @returns {object} - category
   * @throws {AppError} 404 if not found
   */
  async getById(id) {
    const category = await categoryRepository.findById(id);

    if (!category) {
      throw new AppError(404, "Category not found", "CATEGORY_NOT_FOUND");
    }

    return {
      category_id: category.categoryId,
      category_name: category.categoryName,
      description: category.description,
      sort_order: category.sortOrder,
      is_active: category.isActive,
      created_at: category.createdAt,
      updated_at: category.updatedAt,
    };
  },

  /* ── Mutations ───────────────────────── */

  /**
   * Create a new category.
   * @param {object} data - { category_name, description?, sort_order? }
   * @param {string} userId - creator's user ID (for audit)
   * @returns {object} - created category
   */
  async create(data, userId) {
    const category = await categoryRepository.create({
      categoryName: data.category_name.trim(),
      description: data.description ?? null,
      sortOrder: data.sort_order ?? 0,
    });

    auditLogService.logAction({ userId, action: ACTIONS.CATEGORY_CREATED, targetType: "category", targetId: category.categoryId, details: { name: category.categoryName } });

    return {
      category_id: category.categoryId,
      category_name: category.categoryName,
      description: category.description,
      sort_order: category.sortOrder,
      is_active: category.isActive,
      created_at: category.createdAt,
      updated_at: category.updatedAt,
    };
  },

  /**
   * Update an existing category.
   * @param {number} id - category ID
   * @param {object} data - fields to update
   * @param {string} userId - editor's user ID (for audit)
   * @returns {object} - updated category
   * @throws {AppError} 404 if not found
   */
  async update(id, data, userId) {
    const existing = await categoryRepository.findById(id);

    if (!existing) {
      throw new AppError(404, "Category not found", "CATEGORY_NOT_FOUND");
    }

    const updateData = {};

    if (data.category_name !== undefined) {
      updateData.categoryName = data.category_name.trim();
    }
    if (data.description !== undefined) {
      updateData.description = data.description;
    }
    if (data.sort_order !== undefined) {
      updateData.sortOrder = data.sort_order;
    }

    const category = await categoryRepository.update(id, updateData);

    auditLogService.logAction({ userId, action: ACTIONS.CATEGORY_UPDATED, targetType: "category", targetId: id, details: { name: data.name || data.categoryName } });

    return {
      category_id: category.categoryId,
      category_name: category.categoryName,
      description: category.description,
      sort_order: category.sortOrder,
      is_active: category.isActive,
      created_at: category.createdAt,
      updated_at: category.updatedAt,
    };
  },

  /**
   * Delete a category.
   * Blocked if any products reference this category.
   * @param {number} id - category ID
   * @param {string} userId - deleter's user ID (for audit)
   * @throws {AppError} 404 if not found
   * @throws {AppError} 400 if category has products
   */
  async remove(id, userId) {
    const existing = await categoryRepository.findByIdWithProductCount(id);

    if (!existing) {
      throw new AppError(404, "Category not found", "CATEGORY_NOT_FOUND");
    }

    if (existing._count.products > 0) {
      throw new AppError(
        400,
        "Cannot delete category with existing products. Reassign or remove products first.",
        "CATEGORY_HAS_PRODUCTS",
      );
    }

    await categoryRepository.delete(id);

    auditLogService.logAction({ userId, action: ACTIONS.CATEGORY_DELETED, targetType: "category", targetId: id });
  },
};
