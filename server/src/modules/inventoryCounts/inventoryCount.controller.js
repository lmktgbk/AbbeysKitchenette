import { inventoryCountService } from "./inventoryCount.service.js";
import { successResponse, errorResponse } from "../../utils/response.js";
import { AppError } from "../../middleware/errorHandler.middleware.js";

function handleError(res, error, fallbackCode) {
  if (error instanceof AppError) {
    return errorResponse(res, error.message, null, error.statusCode, error.code);
  }
  console.error(`[${fallbackCode}]`, error);
  return errorResponse(res, "Something went wrong", null, 500, fallbackCode);
}

export const inventoryCountController = {
  async startCount(req, res) {
    try {
      const count = await inventoryCountService.start(req.user.id, req.body);
      return successResponse(res, "Inventory count started", { count }, 201);
    } catch (error) {
      return handleError(res, error, "START_COUNT_ERROR");
    }
  },

  async getActiveCount(req, res) {
    try {
      const count = await inventoryCountService.getActive();
      return successResponse(res, "Active count retrieved", { count });
    } catch (error) {
      return handleError(res, error, "GET_ACTIVE_COUNT_ERROR");
    }
  },

  async submitCount(req, res) {
    try {
      const summary = await inventoryCountService.submit(Number(req.params.id), req.body);
      return successResponse(res, "Inventory count submitted", { summary });
    } catch (error) {
      return handleError(res, error, "SUBMIT_COUNT_ERROR");
    }
  },

  async getCount(req, res) {
    try {
      const count = await inventoryCountService.getById(Number(req.params.id));
      return successResponse(res, "Count retrieved", { count });
    } catch (error) {
      return handleError(res, error, "GET_COUNT_ERROR");
    }
  },

  async listCounts(req, res) {
    try {
      const result = await inventoryCountService.list(req.validatedQuery);
      return successResponse(res, "Counts retrieved", result);
    } catch (error) {
      return handleError(res, error, "LIST_COUNTS_ERROR");
    }
  },

  async getSummary(req, res) {
    try {
      const summary = await inventoryCountService.getSummary(Number(req.params.id));
      return successResponse(res, "Summary retrieved", { summary });
    } catch (error) {
      return handleError(res, error, "GET_SUMMARY_ERROR");
    }
  },
};
