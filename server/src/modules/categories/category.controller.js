import { categoryService } from "./category.service.js";
import { successResponse, errorResponse } from "../../utils/response.js";
import { AppError } from "../../middleware/errorHandler.middleware.js";

/**
 * Category Controller
 *
 * Handles HTTP requests for category and subcategory operations.
 * Root categories are read-only (managed via SQL).
 * Subcategories are fully managed through the API.
 */

/**
 * Centralized error handler for category endpoints.
 * Throws AppError → structured error response. Unexpected errors → 500.
 * @param {object} res - Express response
 * @param {Error} error - caught error
 * @param {string} fallbackCode - error code for unexpected errors
 * @returns {Response}
 */
function handleError(res, error, fallbackCode) {
  if (error instanceof AppError) {
    return errorResponse(res, error.message, null, error.statusCode, error.code);
  }
  console.error(`[${fallbackCode}]`, error);
  return errorResponse(res, "Something went wrong", null, 500, fallbackCode);
}

export const categoryController = {
  /** GET /api/categories — all root categories with subcategories */
  async getCategories(req, res) {
    try {
      const categories = await categoryService.getAll();
      return successResponse(res, "Categories retrieved", { categories });
    } catch (error) {
      return handleError(res, error, "GET_CATEGORIES_ERROR");
    }
  },

  /** POST /api/categories/:id/subcategories — create subcategory under root */
  async createSubcategory(req, res) {
    try {
      const categoryId = parseInt(req.params.id, 10);
      const sub = await categoryService.createSubcategory(categoryId, req.body, req.user.id);
      return successResponse(res, "Subcategory created", { subcategory: sub }, 201);
    } catch (error) {
      return handleError(res, error, "CREATE_SUBCATEGORY_ERROR");
    }
  },

  /** PATCH /api/subcategories/:id — update subcategory */
  async updateSubcategory(req, res) {
    try {
      const id = parseInt(req.params.id, 10);
      const sub = await categoryService.updateSubcategory(id, req.body, req.user.id);
      return successResponse(res, "Subcategory updated", { subcategory: sub });
    } catch (error) {
      return handleError(res, error, "UPDATE_SUBCATEGORY_ERROR");
    }
  },

  /** DELETE /api/subcategories/:id — delete subcategory */
  async deleteSubcategory(req, res) {
    try {
      const id = parseInt(req.params.id, 10);
      await categoryService.removeSubcategory(id, req.user.id);
      return successResponse(res, "Subcategory deleted");
    } catch (error) {
      return handleError(res, error, "DELETE_SUBCATEGORY_ERROR");
    }
  },
};
