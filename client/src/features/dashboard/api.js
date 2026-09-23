/**
 * Dashboard API — owns dashboard analytics transport.
 * WHY: keeps consolidated + trend endpoints together so query split stays consistent. Contract: GET /dashboard, GET /dashboard/revenue-trend; returns res.data envelope.
 * State: axios wrappers, no state.
 */
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

// GET /api/dashboard/revenue-trend — revenue trend with granularity
export async function getRevenueTrendRequest(params = {}) {
  const res = await api.get("/dashboard/revenue-trend", { params });
  return res.data;
}
