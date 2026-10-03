/**
 * Orders API — owns order + kitchen + guest order transport.
 * WHY: single contract owner for POS, kitchen display, and public tracking. Contract: GET /orders, GET /orders/kitchen, GET /orders/kitchen/batches, GET /orders/stats, GET /orders/:id, POST /orders, PUT /orders/:id/status, POST /orders/:id/fulfill|cancel|prepare, PATCH /orders/:orderId/items/:itemId, POST .../remove, guest GET /guest/menu, POST /guest/orders, GET /guest/orders/:token; returns res.data envelope.
 * State: axios wrappers, no state.
 */
import api from "@/config/axios";
import { submitOrder } from "./submission";

function submissionOptions(key) {
  // A timeout can precede a server commit; submitOrder retains the replay key.
  return { headers: { "Idempotency-Key": key }, timeout: 30000 };
}

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

// GET /api/orders/kitchen/batches — batch preparation groups
export async function getKitchenBatchGroupsRequest() {
  const res = await api.get("/orders/kitchen/batches");
  return res.data;
}

// GET /api/orders/stats — status counts for KPI cards, optionally scoped by date range
export async function getOrderStatsRequest(params = {}) {
  const res = await api.get("/orders/stats", { params });
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
  const res = await submitOrder("walk-in", data, key => api.post("/orders", data, submissionOptions(key)));
  return res.data;
}

// PUT /api/orders/:id/status — advance status
export async function advanceOrderStatusRequest(id, data) {
  const res = data.status === "accepted"
    ? await submitOrder(`accept:${id}`, data, key => api.put(`/orders/${id}/status`, data, submissionOptions(key)))
    : await api.put(`/orders/${id}/status`, data);
  return res.data;
}

// POST /api/orders/:id/fulfill — fulfill pending online order (edit + accept)
export async function fulfillOrderRequest(id, data) {
  const res = await submitOrder(`fulfill:${id}`, data, key => api.post(`/orders/${id}/fulfill`, data, submissionOptions(key)));
  return res.data;
}

// POST /api/orders/:id/cancel — cancel or delete order
export async function cancelOrderRequest(id, data = {}) {
  const res = await api.post(`/orders/${id}/cancel`, data);
  return res.data;
}

// POST /api/orders/:id/prepare — transition to preparing
export async function prepareOrderRequest(id) {
  const res = await api.post(`/orders/${id}/prepare`);
  return res.data;
}

// PATCH /api/orders/:id/items/:itemId — toggle item prepared
export async function checkOrderItemRequest(orderId, itemId, data) {
  const res = await api.patch(`/orders/${orderId}/items/${itemId}`, data);
  return res.data;
}

// POST /api/orders/:id/items/:itemId/remove — remove item from order
export async function removeOrderItemRequest(orderId, itemId, data = {}) {
  const res = await api.post(`/orders/${orderId}/items/${itemId}/remove`, data);
  return res.data;
}

// ── Guest (Public) ──────────────────

// GET /api/guest/menu — available products
export async function getGuestMenuRequest(params = {}) {
  const res = await api.get("/guest/menu", { params, timeout: 10000 });
  if (!res.data?.success || !Array.isArray(res.data?.data?.menu)) {
    throw new Error("The menu could not be loaded. Please try again.");
  }
  return res.data;
}

// POST /api/guest/orders — place online order
export async function placeGuestOrderRequest(data) {
  const res = await submitOrder("guest-order", data, async key => {
    const response = await api.post("/guest/orders", data, submissionOptions(key));
    // Keep the replay key until a usable confirmation arrives; HTTP 200 alone is insufficient.
    if (!response.data?.success || !response.data.data?.order?.order_id || !response.data.data.order.guest_token) {
      throw new Error("Order confirmation was incomplete. Retry the same order to recover its confirmation.");
    }
    return response;
  });
  return res.data;
}

// GET /api/guest/orders/:token — track own order (public, read-only)
export async function getGuestOrderRequest(token) {
  const res = await api.get(`/guest/orders/${token}`);
  return res.data;
}
