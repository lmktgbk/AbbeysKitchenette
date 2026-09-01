import { reorderSuggestionsService } from "./reorderSuggestions.service.js";
import { successResponse, errorResponse } from "../../utils/response.js";
import { AppError } from "../../middleware/errorHandler.middleware.js";

/**
 * Reorder Suggestions Controller
 *
 * Handles HTTP requests for reorder suggestion operations.
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

export const reorderSuggestionsController = {
  /**
   * GET /api/reorder-suggestions
   * List all pending reorder suggestions.
   */
  async getSuggestions(req, res) {
    try {
      const suggestions = await reorderSuggestionsService.getPending();
      return successResponse(res, "Reorder suggestions retrieved", {
        suggestions,
      });
    } catch (error) {
      return handleError(res, error, "GET_REORDER_SUGGESTIONS_ERROR");
    }
  },

  /**
   * POST /api/reorder-suggestions/generate
   * Generate new reorder suggestions using AI.
   */
  async generateSuggestions(req, res) {
    try {
      const suggestions = await reorderSuggestionsService.generate();
      return successResponse(res, "Reorder suggestions generated", {
        suggestions,
      });
    } catch (error) {
      return handleError(res, error, "GENERATE_REORDER_SUGGESTIONS_ERROR");
    }
  },

  /**
   * POST /api/reorder-suggestions/:id/accept
   * Accept a reorder suggestion.
   */
  async acceptSuggestion(req, res) {
    try {
      const suggestion = await reorderSuggestionsService.accept(req.params.id);
      return successResponse(res, "Suggestion accepted", { suggestion });
    } catch (error) {
      return handleError(res, error, "ACCEPT_REORDER_SUGGESTION_ERROR");
    }
  },

  /**
   * POST /api/reorder-suggestions/:id/reject
   * Reject a reorder suggestion.
   */
  async rejectSuggestion(req, res) {
    try {
      const suggestion = await reorderSuggestionsService.reject(req.params.id);
      return successResponse(res, "Suggestion rejected", { suggestion });
    } catch (error) {
      return handleError(res, error, "REJECT_REORDER_SUGGESTION_ERROR");
    }
  },
};
