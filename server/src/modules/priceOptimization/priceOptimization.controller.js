import priceOptimizationService from "./priceOptimization.service.js";
import { successResponse, errorResponse } from "../../utils/response.js";
import { AppError } from "../../middleware/errorHandler.middleware.js";

function handleError(res, error, fallbackCode) {
  if (error instanceof AppError) {
    return errorResponse(res, error.message, null, error.statusCode, error.code);
  }
  console.error(`[${fallbackCode}]`, error);
  return errorResponse(res, "Something went wrong", null, 500, fallbackCode);
}

const priceOptimizationController = {
  /**
   * GET /api/price-optimization
   * Get pending suggestions, optionally filtered by productId query param.
   */
  async getSuggestions(req, res) {
    try {
      const { productId } = req.query;
      const suggestions = await priceOptimizationService.getPending(productId);
      return successResponse(res, "Suggestions retrieved", { suggestions });
    } catch (error) {
      return handleError(res, error, "GET_PRICE_SUGGESTIONS_ERROR");
    }
  },

  /**
   * POST /api/price-optimization/generate
   * Generate new price suggestions for a product.
   * Body: { productId }
   */
  async generateSuggestions(req, res) {
    try {
      const { productId } = req.body;
      if (!productId) {
        throw new AppError(400, "productId is required", "MISSING_PRODUCT_ID");
      }
      const recommendations = await priceOptimizationService.generate(productId);
      return successResponse(res, "Price suggestions generated", { recommendations });
    } catch (error) {
      return handleError(res, error, "GENERATE_PRICE_SUGGESTIONS_ERROR");
    }
  },

  /**
   * POST /api/price-optimization/:id/apply
   * Apply recommended price to variant.
   */
  async applyPrice(req, res) {
    try {
      const { id } = req.params;
      const suggestion = await priceOptimizationService.applyPrice(Number(id));
      return successResponse(res, "Price applied successfully", { suggestion });
    } catch (error) {
      return handleError(res, error, "APPLY_PRICE_ERROR");
    }
  },

  /**
   * POST /api/price-optimization/:id/dismiss
   * Dismiss a suggestion.
   */
  async dismissSuggestion(req, res) {
    try {
      const { id } = req.params;
      const suggestion = await priceOptimizationService.dismiss(Number(id));
      return successResponse(res, "Suggestion dismissed", { suggestion });
    } catch (error) {
      return handleError(res, error, "DISMISS_PRICE_ERROR");
    }
  },
};

export default priceOptimizationController;
