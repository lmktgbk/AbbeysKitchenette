import { categoryService } from "./category.service.js";
import { successResponse, errorResponse } from "../../utils/response.js";
import { AppError } from "../../middleware/errorHandler.middleware.js";

/**
 * Category Controller
 *
 * Handles HTTP requests for category operations.
 * Uses handleError to standardize error responses.
 */

/**
 * Wraps error response logic: AppError → show message, unexpected → generic.
 */
function handleError(res, error, fallbackCode) {
  if (error instanceof AppError) {
    return errorResponse(
      res,
      error.message,
      null,
      error.statusCode,
      error.code,
    );
  }
  console.error(`[${fallbackCode}]`, error);
  return errorResponse(res, "Something went wrong", null, 500, fallbackCode);
}

export const categoryController = {
  /**
   * GET /api/categories
   * Return all categories with product counts.
   */
  async getCategories(req, res) {
    try {
      const categories = await categoryService.getAll();
      return successResponse(res, "Categories retrieved", { categories });
    } catch (error) {
      return handleError(res, error, "GET_CATEGORIES_ERROR");
    }
  },

  /**
   * POST /api/categories
   * Create a new category.
   */
  async createCategory(req, res) {
    try {
      const category = await categoryService.create(req.body, req.user.id);
      return successResponse(res, "Category created", { category }, 201);
    } catch (error) {
      return handleError(res, error, "CREATE_CATEGORY_ERROR");
    }
  },

  /**
   * PATCH /api/categories/:id
   * Update an existing category.
   */
  async updateCategory(req, res) {
    try {
      const id = parseInt(req.params.id, 10);
      const category = await categoryService.update(id, req.body, req.user.id);
      return successResponse(res, "Category updated", { category });
    } catch (error) {
      return handleError(res, error, "UPDATE_CATEGORY_ERROR");
    }
  },

  /**
   * DELETE /api/categories/:id
   * Delete a category (blocked if has products).
   */
  async deleteCategory(req, res) {
    try {
      const id = parseInt(req.params.id, 10);
      await categoryService.remove(id, req.user.id);
      return successResponse(res, "Category deleted");
    } catch (error) {
      return handleError(res, error, "DELETE_CATEGORY_ERROR");
    }
  },
};
