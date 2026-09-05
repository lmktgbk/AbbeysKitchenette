import { auditLogService } from "./auditLog.service.js";
import { successResponse, errorResponse } from "../../utils/response.js";
import { AppError } from "../../middleware/errorHandler.middleware.js";

function handleError(res, error, fallbackCode) {
  if (error instanceof AppError) {
    return errorResponse(res, error.message, null, error.statusCode, error.code);
  }
  console.error(`[${fallbackCode}]`, error);
  return errorResponse(res, "Something went wrong", null, 500, fallbackCode);
}

export const auditLogController = {
  async getLogs(req, res) {
    try {
      if (req.user.role !== "admin") {
        throw new AppError(403, "Only admins can view audit logs", "FORBIDDEN");
      }

      const { page, limit, userId, action, targetType, startDate, endDate, search } = req.query;

      const result = await auditLogService.getLogs({
        page: page ? parseInt(page) : 1,
        limit: limit ? parseInt(limit) : 50,
        userId,
        action,
        targetType,
        startDate,
        endDate,
        search,
      });

      return successResponse(res, "Audit logs retrieved", result);
    } catch (error) {
      return handleError(res, error, "GET_AUDIT_LOGS_ERROR");
    }
  },
};
