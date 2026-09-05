import api from "@/config/axios";

/** Get audit logs with filters and pagination */
export async function getAuditLogsRequest({ page, limit, userId, action, targetType, startDate, endDate, search }) {
  const params = new URLSearchParams();
  if (page) params.set("page", page);
  if (limit) params.set("limit", limit);
  if (userId) params.set("userId", userId);
  if (action) params.set("action", action);
  if (targetType) params.set("targetType", targetType);
  if (startDate) params.set("startDate", startDate);
  if (endDate) params.set("endDate", endDate);
  if (search) params.set("search", search);

  const res = await api.get(`/audit-logs?${params.toString()}`);
  return res.data;
}
