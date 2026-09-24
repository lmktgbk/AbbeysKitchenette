import { reorderSuggestionsService } from "./reorderSuggestions.service.js";
import { successResponse, controllerError } from "../../utils/response.js";
import { auditLogService } from "../auditLogs/auditLog.service.js";
import { ACTIONS } from "../auditLogs/auditLog.constants.js";

/**
 * Reorder Suggestions Controller
 *
 * Handles HTTP requests for reorder suggestion operations.
 */

function handleError(res, error, fallbackCode) {
  return controllerError(res, error, fallbackCode);
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
      auditLogService.logAction({
        userId: req.user.id,
        action: ACTIONS.REORDER_RUN,
        targetType: "reorder",
        details: { source: "manual", count: suggestions.length },
      }).catch(() => {});
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
      const suggestion = await reorderSuggestionsService.accept(req.params.id, req.user.id);
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
      const suggestion = await reorderSuggestionsService.reject(req.params.id, req.user.id);
      return successResponse(res, "Suggestion rejected", { suggestion });
    } catch (error) {
      return handleError(res, error, "REJECT_REORDER_SUGGESTION_ERROR");
    }
  },
};
