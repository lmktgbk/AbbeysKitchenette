import api from "@/config/axios";

/**
 * Orders API
 *
 * All API requests for order operations.
 * Returns res.data (the { success, message, data } envelope from backend).
 */

// ── List & Get ──────────────────────

// GET /api/orders — paginated list with search, filter, sort
export async function getOrdersRequest(params = {}) {
  const res = await api.get("/orders", { params });
  return res.data;
}

// GET /api/orders/kitchen — kitchen display with items
export async function getKitchenOrdersRequest() {
  const res = await api.get("/orders/kitchen");
  return res.data;
}

// GET /api/orders/stats — status counts for KPI cards
export async function getOrderStatsRequest() {
  const res = await api.get("/orders/stats");
  return res.data;
}

// GET /api/orders/:id — order detail with items
export async function getOrderDetailRequest(id) {
  const res = await api.get(`/orders/${id}`);
  return res.data;
}

// ── Create & Update ─────────────────

// POST /api/orders — create walk-in order (auto-accepted)
export async function createOrderRequest(data) {
  const res = await api.post("/orders", data);
  return res.data;
}

// PUT /api/orders/:id — edit pending order
export async function editOrderRequest(id, data) {
  const res = await api.put(`/orders/${id}`, data);
  return res.data;
}

// PUT /api/orders/:id/status — advance status
export async function advanceOrderStatusRequest(id, data) {
  const res = await api.put(`/orders/${id}/status`, data);
  return res.data;
}

// POST /api/orders/:id/fulfill — fulfill pending online order (edit + accept)
export async function fulfillOrderRequest(id, data) {
  const res = await api.post(`/orders/${id}/fulfill`, data);
  return res.data;
}

// POST /api/orders/:id/cancel — cancel or delete order
export async function cancelOrderRequest(id, data = {}) {
  const res = await api.post(`/orders/${id}/cancel`, data);
  return res.data;
}

// ── Guest (Public) ──────────────────

// GET /api/guest/menu — available products
export async function getGuestMenuRequest(params = {}) {
  const res = await api.get("/guest/menu", { params });
  return res.data;
}

// POST /api/guest/orders — place online order
export async function placeGuestOrderRequest(data) {
  const res = await api.post("/guest/orders", data);
  return res.data;
}
