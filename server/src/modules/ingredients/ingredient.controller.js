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
   * Return paginated non-archived ingredients with stock info.
   * Query params: page, limit, search, status, sortBy, sortDir
   * Response: { ingredients: [...], totalItems: number }
   */
  async getIngredients(req, res) {
    try {
      const { page, limit, search, status, sortBy, sortDir } = req.validatedQuery;
      const result = await ingredientService.getAll({
        page: Number(page),
        limit: Number(limit),
        search,
        status,
        sortBy,
        sortDir,
      });
      return successResponse(res, "Ingredients retrieved", result);
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
   * GET /api/ingredients/alerts
   * Get all active (unresolved) stock alerts for sidebar.
   */
  async getActiveAlerts(req, res) {
    try {
      const alerts = await ingredientService.getActiveAlerts();
      return successResponse(res, "Alerts retrieved", { alerts });
    } catch (error) {
      return handleError(res, error, "GET_ALERTS_ERROR");
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
   * PATCH /api/ingredients/:id
   * Update ingredient name and/or minimum threshold.
   */
  async updateIngredient(req, res) {
    try {
      const ingredient = await ingredientService.update(req.params.id, req.body);
      return successResponse(res, "Ingredient updated", { ingredient });
    } catch (error) {
      return handleError(res, error, "UPDATE_INGREDIENT_ERROR");
    }
  },

  /**
   * POST /api/ingredients/:id/restock
   * Restock an ingredient — adds stock via a new FIFO batch.
   */
  async restockIngredient(req, res) {
    try {
      const ingredient = await ingredientService.restock(
        req.params.id,
        req.body,
        req.user.id,
      );
      return successResponse(res, "Stock restocked", { ingredient });
    } catch (error) {
      return handleError(res, error, "RESTOCK_INGREDIENT_ERROR");
    }
  },

  /**
   * POST /api/ingredients/:id/loss
   * Declare a loss — deducts stock from a specific batch or via FIFO.
   */
  async declareLoss(req, res) {
    try {
      const ingredient = await ingredientService.declareLoss(
        req.params.id,
        req.body,
        req.user.id,
      );
      return successResponse(res, "Loss declared", { ingredient });
    } catch (error) {
      return handleError(res, error, "DECLARE_LOSS_ERROR");
    }
  },

  /**
   * GET /api/ingredients/archived
   * Return archived ingredients with pagination, search, sort.
   */
  async getArchivedIngredients(req, res) {
    try {
      const { page, limit, search, sortBy, sortDir } = req.validatedQuery;
      const result = await ingredientService.getArchived({
        page: Number(page),
        limit: Number(limit),
        search,
        sortBy,
        sortDir,
      });
      return successResponse(res, "Archived ingredients retrieved", result);
    } catch (error) {
      return handleError(res, error, "GET_ARCHIVED_ERROR");
    }
  },

  /**
   * GET /api/ingredients/:id/batches
   * Return paginated restock batches for an ingredient.
   */
  async getBatches(req, res) {
    try {
      const { page, limit, search } = req.validatedQuery;
      const result = await ingredientService.getBatches(req.params.id, {
        page: Number(page),
        limit: Number(limit),
        search,
      });
      return successResponse(res, "Batches retrieved", result);
    } catch (error) {
      return handleError(res, error, "GET_BATCHES_ERROR");
    }
  },

  /**
   * GET /api/ingredients/:id/history
   * Return paginated stock adjustment history for an ingredient.
   * Supports search (notes, adjuster name, date) and type filter.
   */
  async getHistory(req, res) {
    try {
      const { page, limit, search, type } = req.validatedQuery;
      const result = await ingredientService.getHistory(req.params.id, {
        page: Number(page),
        limit: Number(limit),
        search,
        type,
      });
      return successResponse(res, "History retrieved", result);
    } catch (error) {
      return handleError(res, error, "GET_HISTORY_ERROR");
    }
  },

  /**
   * PATCH /api/ingredients/:id/batches/:batchId/priority
   * Toggle priority (star) on a batch. Enforces single-star rule.
   */
  async toggleBatchPriority(req, res) {
    try {
      const batch = await ingredientService.toggleBatchPriority(
        req.params.id,
        Number(req.params.batchId),
        req.body.is_priority,
      );
      return successResponse(res, "Batch priority updated", { batch });
    } catch (error) {
      return handleError(res, error, "TOGGLE_PRIORITY_ERROR");
    }
  },

  /**
   * PATCH /api/ingredients/:id/batches/follow-fifo
   * Clear all priority flags — return to natural FIFO order.
   */
  async followFifo(req, res) {
    try {
      const result = await ingredientService.followFifo(req.params.id);
      return successResponse(res, "FIFO order restored", result);
    } catch (error) {
      return handleError(res, error, "FOLLOW_FIFO_ERROR");
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
