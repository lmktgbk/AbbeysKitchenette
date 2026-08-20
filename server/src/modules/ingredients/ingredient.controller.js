import { ingredientService } from "./ingredient.service.js";
import { successResponse, errorResponse } from "../../utils/response.js";
import { AppError } from "../../middleware/errorHandler.middleware.js";

/**
 * Ingredient Controller
 *
 * Handles HTTP requests for ingredient operations.
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

export const ingredientController = {
  /**
   * GET /api/ingredients
   * Return all non-archived ingredients with stock info.
   */
  async getIngredients(req, res) {
    try {
      const ingredients = await ingredientService.getAll();
      return successResponse(res, "Ingredients retrieved", { ingredients });
    } catch (error) {
      return handleError(res, error, "GET_INGREDIENTS_ERROR");
    }
  },

  /**
   * GET /api/ingredients/summary
   * Get ingredient status counts for KPI cards.
   */
  async getSummary(req, res) {
    try {
      const summary = await ingredientService.getSummary();
      return successResponse(res, "Summary retrieved", { summary });
    } catch (error) {
      return handleError(res, error, "GET_SUMMARY_ERROR");
    }
  },

  /**
   * POST /api/ingredients
   * Create a new ingredient.
   * Stock starts at 0 — admin must restock separately.
   */
  async createIngredient(req, res) {
    try {
      const ingredient = await ingredientService.create(req.body);
      return successResponse(res, "Ingredient created", { ingredient }, 201);
    } catch (error) {
      return handleError(res, error, "CREATE_INGREDIENT_ERROR");
    }
  },

  /**
   * GET /api/ingredients/archived
   * Return all archived ingredients.
   */
  async getArchivedIngredients(req, res) {
    try {
      const ingredients = await ingredientService.getArchived();
      return successResponse(res, "Archived ingredients retrieved", { ingredients });
    } catch (error) {
      return handleError(res, error, "GET_ARCHIVED_ERROR");
    }
  },

  /**
   * PATCH /api/ingredients/:id/archive
   * Archive an ingredient.
   */
  async archiveIngredient(req, res) {
    try {
      const ingredient = await ingredientService.archive(req.params.id);
      return successResponse(res, "Ingredient archived", { ingredient });
    } catch (error) {
      return handleError(res, error, "ARCHIVE_INGREDIENT_ERROR");
    }
  },

  /**
   * PATCH /api/ingredients/:id/restore
   * Restore an archived ingredient.
   */
  async restoreIngredient(req, res) {
    try {
      const ingredient = await ingredientService.restore(req.params.id);
      return successResponse(res, "Ingredient restored", { ingredient });
    } catch (error) {
      return handleError(res, error, "RESTORE_INGREDIENT_ERROR");
    }
  },

  /**
   * DELETE /api/ingredients/:id
   * Permanently delete an ingredient.
   */
  async deleteIngredient(req, res) {
    try {
      const result = await ingredientService.delete(req.params.id);
      return successResponse(res, "Ingredient deleted", result);
    } catch (error) {
      return handleError(res, error, "DELETE_INGREDIENT_ERROR");
    }
  },
};
