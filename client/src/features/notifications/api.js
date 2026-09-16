import api from "@/config/axios";

/**
 * Notifications API
 *
 * All API requests for notification operations.
 * Returns res.data (the { success, message, data } envelope from backend).
 */

// GET /api/notifications — paginated notifications
export async function getNotificationsRequest(params = {}) {
  const res = await api.get("/notifications", { params });
  return res.data;
}

// GET /api/notifications/unread-count — unread count
export async function getUnreadCountRequest() {
  const res = await api.get("/notifications/unread-count");
  return res.data;
}

// PATCH /api/notifications/:id/read — mark one as read
export async function markAsReadRequest(id) {
  const res = await api.patch(`/notifications/${id}/read`);
  return res.data;
}

// PATCH /api/notifications/read-all — mark all as read
export async function markAllAsReadRequest() {
  const res = await api.patch("/notifications/read-all");
  return res.data;
}

// DELETE /api/notifications/:id — delete one
export async function deleteNotificationRequest(id) {
  const res = await api.delete(`/notifications/${id}`);
  return res.data;
}
