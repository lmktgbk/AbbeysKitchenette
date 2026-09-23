/**
 * Shifts API — owns drawer-session transport (BR-02).
 * WHY: single contract owner for open/close and shift reads so query hooks stay thin. Contract: POST /shifts/open, GET /shifts/mine, GET /shifts/mine/history, GET /shifts/stats, GET /shifts, GET /shifts/:id, GET /shifts/:id/summary, GET /shifts/:id/orders, GET /shifts/:id/ingredient-usage, POST /shifts/:id/close, POST /shifts/:id/force-close; returns res.data envelope.
 * State: axios wrappers, no state.
 */
import api from "@/config/axios";

/**
 * Shifts API (BR-02)
 *
 * Cashier drawer sessions: open with declared cash, close with
 * declared count after reviewing the breakdown.
 * Returns res.data (the { success, message, data } envelope).
 */

// POST /api/shifts/open — open drawer session
export async function openShiftRequest(data) {
  const res = await api.post("/shifts/open", data);
  return res.data;
}

// GET /api/shifts/mine — own open shifts with live summaries
export async function getMyShiftsRequest() {
  const res = await api.get("/shifts/mine");
  return res.data;
}

// GET /api/shifts/mine/history — own closed shifts
export async function getMyHistoryRequest() {
  const res = await api.get("/shifts/mine/history");
  return res.data;
}

// GET /api/shifts/stats — period aggregates for the KPI row
export async function getShiftStatsRequest(params = {}) {
  const res = await api.get("/shifts/stats", { params });
  return res.data;
}

// GET /api/shifts — admin list with filters
export async function getShiftsRequest(params = {}) {
  const res = await api.get("/shifts", { params });
  return res.data;
}

// GET /api/shifts/:id — single shift with summary
export async function getShiftRequest(id) {
  const res = await api.get(`/shifts/${id}`);
  return res.data;
}

// GET /api/shifts/:id/summary — reconciliation breakdown
export async function getShiftSummaryRequest(id) {
  const res = await api.get(`/shifts/${id}/summary`);
  return res.data;
}

// GET /api/shifts/:id/orders — windowed orders of one shift
export async function getShiftOrdersRequest(id, params = {}) {
  const res = await api.get(`/shifts/${id}/orders`, { params });
  return res.data;
}

// GET /api/shifts/:id/ingredient-usage — Ingredient usage for one shift
export async function getShiftIngredientUsageRequest(id) {
  const res = await api.get(`/shifts/${id}/ingredient-usage`);
  return res.data;
}

// POST /api/shifts/:id/close — end own shift
export async function closeShiftRequest(id, data) {
  const res = await api.post(`/shifts/${id}/close`, data);
  return res.data;
}

// POST /api/shifts/:id/force-close — admin ends someone's shift
export async function forceCloseShiftRequest(id, data) {
  const res = await api.post(`/shifts/${id}/force-close`, data);
  return res.data;
}
