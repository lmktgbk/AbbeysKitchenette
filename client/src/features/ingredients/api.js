import api from "@/config/axios";

/**
 * Ingredients API
 *
 * All API requests for ingredient operations.
 * Returns res.data (the { success, message, data } envelope from backend).
 */

// ── List & Get ──────────────────────

// GET /api/ingredients — paginated list with search, filter, sort
export async function getIngredientsRequest(params = {}) {
  const res = await api.get("/ingredients", { params });
  return res.data;
}

// GET /api/ingredients/summary — status counts for KPI cards
export async function getIngredientSummaryRequest() {
  const res = await api.get("/ingredients/summary");
  return res.data;
}

// GET /api/ingredients/archived — archived ingredients
export async function getArchivedIngredientsRequest(params = {}) {
  const res = await api.get("/ingredients/archived", { params });
  return res.data;
}

// GET /api/ingredients/alerts — active stock alerts
export async function getActiveAlertsRequest() {
  const res = await api.get("/ingredients/alerts");
  return res.data;
}

// ── Create & Update ─────────────────

// POST /api/ingredients — create ingredient
export async function createIngredientRequest(data) {
  const res = await api.post("/ingredients", data);
  return res.data;
}

// PATCH /api/ingredients/:id — update ingredient
export async function updateIngredientRequest(id, data) {
  const res = await api.patch(`/ingredients/${id}`, data);
  return res.data;
}

// ── Stock Operations ────────────────

// POST /api/ingredients/:id/restock — restock ingredient
export async function restockIngredientRequest(id, data) {
  const res = await api.post(`/ingredients/${id}/restock`, data);
  return res.data;
}

// POST /api/ingredients/:id/loss — declare loss
export async function declareLossRequest(id, data) {
  const res = await api.post(`/ingredients/${id}/loss`, data);
  return res.data;
}

// ── Batches ─────────────────────────

// GET /api/ingredients/:id/batches — restock batches for an ingredient
export async function getIngredientBatchesRequest(id, params = {}) {
  const res = await api.get(`/ingredients/${id}/batches`, { params });
  return res.data;
}

// PATCH /api/ingredients/:id/batches/:batchId/priority — toggle batch priority
export async function toggleBatchPriorityRequest(id, batchId, isPriority) {
  const res = await api.patch(
    `/ingredients/${id}/batches/${batchId}/priority`,
    {
      is_priority: isPriority,
    },
  );
  return res.data;
}

// PATCH /api/ingredients/:id/batches/follow-fifo — clear all priority flags, restore FIFO
export async function followFifoRequest(id) {
  const res = await api.patch(`/ingredients/${id}/batches/follow-fifo`);
  return res.data;
}

// ── History ─────────────────────────

// GET /api/ingredients/:id/history — adjustment history with pagination, search, type filter
export async function getAdjustmentHistoryRequest(id, params = {}) {
  const res = await api.get(`/ingredients/${id}/history`, { params });
  return res.data;
}

// ── Archive & Delete ────────────────

// PATCH /api/ingredients/:id/archive — archive (soft delete)
export async function archiveIngredientRequest(id) {
  const res = await api.patch(`/ingredients/${id}/archive`);
  return res.data;
}

// PATCH /api/ingredients/:id/restore — restore from archive
export async function restoreIngredientRequest(id) {
  const res = await api.patch(`/ingredients/${id}/restore`);
  return res.data;
}

// DELETE /api/ingredients/:id — hard delete
export async function deleteIngredientRequest(id) {
  const res = await api.delete(`/ingredients/${id}`);
  return res.data;
}
