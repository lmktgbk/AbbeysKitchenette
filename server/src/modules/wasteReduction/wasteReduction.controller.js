import { wasteReductionService } from "./wasteReduction.service.js";
import { successResponse, errorResponse } from "../../utils/response.js";
import { AppError } from "../../middleware/errorHandler.middleware.js";

/**
 * Waste Reduction Controller
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

export const wasteReductionController = {
  /**
   * GET /api/waste-reduction
   * List all pending waste reduction insights.
   */
  async getInsights(req, res) {
    try {
      const insights = await wasteReductionService.getPending();
      return successResponse(res, "Waste reduction insights retrieved", {
        insights,
      });
    } catch (error) {
      return handleError(res, error, "GET_WASTE_INSIGHTS_ERROR");
    }
  },

  /**
   * POST /api/waste-reduction/generate
   * Generate new waste reduction insights using AI.
   */
  async generateInsights(req, res) {
    try {
      const insights = await wasteReductionService.generate();
      return successResponse(res, "Waste reduction insights generated", {
        insights,
      });
    } catch (error) {
      return handleError(res, error, "GENERATE_WASTE_INSIGHTS_ERROR");
    }
  },

  /**
   * POST /api/waste-reduction/:id/accept
   * Accept a waste reduction insight.
   */
  async acceptInsight(req, res) {
    try {
      const insight = await wasteReductionService.accept(req.params.id);
      return successResponse(res, "Insight accepted", { insight });
    } catch (error) {
      return handleError(res, error, "ACCEPT_WASTE_INSIGHT_ERROR");
    }
  },

  /**
   * POST /api/waste-reduction/:id/reject
   * Reject a waste reduction insight.
   */
  async rejectInsight(req, res) {
    try {
      const insight = await wasteReductionService.reject(req.params.id);
      return successResponse(res, "Insight rejected", { insight });
    } catch (error) {
      return handleError(res, error, "REJECT_WASTE_INSIGHT_ERROR");
    }
  },
};
