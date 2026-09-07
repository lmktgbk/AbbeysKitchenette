import api from "@/config/axios";

/**
 * Dashboard API
 *
 * All API requests for the admin dashboard.
 * Returns res.data (the { success, message, data } envelope from backend).
 */

// GET /api/dashboard — consolidated dashboard analytics
export async function getDashboardRequest(params = {}) {
  const res = await api.get("/dashboard", { params });
  return res.data;
}
