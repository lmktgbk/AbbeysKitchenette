import api from "@/config/axios";

// GET /api/inventory-counts/active
export async function getActiveCountRequest() {
  const res = await api.get("/inventory-counts/active");
  return res.data;
}

// POST /api/inventory-counts — start new count
export async function startCountRequest(data) {
  const res = await api.post("/inventory-counts", data);
  return res.data;
}

// POST /api/inventory-counts/:id/submit — submit count results
export async function submitCountRequest(id, data) {
  const res = await api.post(`/inventory-counts/${id}/submit`, data);
  return res.data;
}

// GET /api/inventory-counts/:id — get count details
export async function getCountRequest(id) {
  const res = await api.get(`/inventory-counts/${id}`);
  return res.data;
}

// GET /api/inventory-counts — list counts
export async function listCountsRequest(params = {}) {
  const res = await api.get("/inventory-counts", { params });
  return res.data;
}

// GET /api/inventory-counts/:id/summary
export async function getCountSummaryRequest(id) {
  const res = await api.get(`/inventory-counts/${id}/summary`);
  return res.data;
}
