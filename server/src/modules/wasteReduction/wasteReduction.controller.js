import { wasteReductionService } from "./wasteReduction.service.js";
import { successResponse, controllerError } from "../../utils/response.js";

/**
 * Waste Reduction Controller
 */

function handleError(res, error, fallbackCode) {
  return controllerError(res, error, fallbackCode);
}

export const wasteReductionController = {
  async prioritizeBatch(req, res) {
    try {
      const batch = await wasteReductionService.prioritize(req.params.id, Number(req.params.batchId), req.user.id);
      return successResponse(res, "Batch prioritized", { batch });
    } catch (error) { return handleError(res, error, "WASTE_PRIORITY_ERROR"); }
  },

  async recordExpiredLoss(req, res) {
    try {
      const ingredient = await wasteReductionService.expiredLoss(req.params.id, Number(req.params.batchId), req.user.id);
      return successResponse(res, "Expired loss recorded", { ingredient });
    } catch (error) { return handleError(res, error, "WASTE_EXPIRED_LOSS_ERROR"); }
  },
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
      const insights = await wasteReductionService.generate({ userId: req.user.id });
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
      const insight = await wasteReductionService.accept(req.params.id, req.user.id);
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
      const insight = await wasteReductionService.reject(req.params.id, req.user.id);
      return successResponse(res, "Insight rejected", { insight });
    } catch (error) {
      return handleError(res, error, "REJECT_WASTE_INSIGHT_ERROR");
    }
  },
};
