import { auditLogRepository } from "./auditLog.repository.js";

export const auditLogService = {
  /**
   * Log a user action. Fire-and-forget — failures are silently caught.
   * @param {object} params
   * @param {string} [params.userId] - who performed the action
   * @param {string} params.action - action type constant
   * @param {string} [params.targetType] - entity type (e.g., "product")
   * @param {string} [params.targetId] - entity ID
   * @param {object} [params.details] - additional context (before/after values)
   * @param {string} [params.ipAddress] - request IP
   */
  async logAction({ userId, action, targetType, targetId, details, ipAddress }) {
    try {
      await auditLogRepository.create({
        userId,
        action,
        targetType,
        targetId,
        details,
        ipAddress,
      });
    } catch (err) {
      console.error("[audit] Failed to log action:", action, err.message);
    }
  },

  async getLogs({ page, limit, userId, action, targetType, startDate, endDate, search }) {
    return auditLogRepository.findMany({
      page,
      limit,
      userId,
      action,
      targetType,
      startDate,
      endDate,
      search,
    });
  },
};
