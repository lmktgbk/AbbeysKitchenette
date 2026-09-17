import api from "@/config/axios";

// GET /api/shifts/active — get current active shift
export async function getActiveShiftRequest() {
  const res = await api.get("/shifts/active");
  return res.data;
}

// POST /api/shifts — start a new shift
export async function startShiftRequest(data) {
  const res = await api.post("/shifts", data);
  return res.data;
}

// PUT /api/shifts/:id/end — end a shift
export async function endShiftRequest(id, data) {
  const res = await api.put(`/shifts/${id}/end`, data);
  return res.data;
}

// GET /api/shifts/:id — get shift details
export async function getShiftRequest(id) {
  const res = await api.get(`/shifts/${id}`);
  return res.data;
}

// GET /api/shifts — list shifts
export async function listShiftsRequest(params = {}) {
  const res = await api.get("/shifts", { params });
  return res.data;
}

// GET /api/shifts/reconciliation — cash reconciliation
export async function getReconciliationRequest(params = {}) {
  const res = await api.get("/shifts/reconciliation", { params });
  return res.data;
}
