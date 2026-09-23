import { auditLogService } from "./auditLog.service.js";
import { successResponse, controllerError } from "../../utils/response.js";
import { AppError } from "../../middleware/errorHandler.middleware.js";

/**
 * Audit Log Controller (admin-only — router guard plus an in-handler role
 * re-check, since the trail itself is sensitive: it names who did what).
 */

function handleError(res, error, fallbackCode) {
  return controllerError(res, error, fallbackCode);
}

export const auditLogController = {
  async getLogs(req, res) {
    try {
      if (req.user.role !== "admin") {
        throw new AppError(403, "Only admins can view audit logs", "FORBIDDEN");
      }

      const { page, limit, userId, action, actions, targetType, startDate, endDate, search } = req.query;

      const result = await auditLogService.getLogs({
        page: page ? parseInt(page) : 1,
        limit: limit ? parseInt(limit) : 50,
        userId,
        action,
        actions,
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
