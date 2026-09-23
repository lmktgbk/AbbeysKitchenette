/**
 * AuditLogs API — owns compliance audit-trail transport.
 * WHY: centralizes filter-to-querystring mapping so tables pass plain objects. Contract: GET /audit-logs?page=&limit=&userId=&action=&actions=&targetType=&startDate=&endDate=&search=; returns res.data envelope.
 * State: axios wrappers, no state.
 */
import api from "@/config/axios";

/** Get audit logs with filters and pagination */
export async function getAuditLogsRequest({ page, limit, userId, action, actions, targetType, startDate, endDate, search }) {
  const params = new URLSearchParams();
  if (page) params.set("page", page);
  if (limit) params.set("limit", limit);
  if (userId) params.set("userId", userId);
  if (action) params.set("action", action);
  if (actions) params.set("actions", actions);
  if (targetType) params.set("targetType", targetType);
  if (startDate) params.set("startDate", startDate);
  if (endDate) params.set("endDate", endDate);
  if (search) params.set("search", search);

  const res = await api.get(`/audit-logs?${params.toString()}`);
  return res.data;
}
