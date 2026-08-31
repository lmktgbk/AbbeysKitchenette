import api from "@/config/axios";

/**
 * Demand Forecasting API
 *
 * All requests go through Express proxy → Python FastAPI service.
 */

// POST /api/forecasting/demand/run
export async function runDemandForecast() {
  const res = await api.post("/forecasting/demand/run");
  return res.data;
}

// GET /api/forecasting/demand/status?jobId=X
export async function getDemandStatus(jobId) {
  const res = await api.get("/forecasting/demand/status", { params: { jobId } });
  return res.data;
}

// GET /api/forecasting/demand/results?jobId=X
export async function getDemandResults(jobId) {
  const res = await api.get("/forecasting/demand/results", { params: { jobId } });
  return res.data;
}

// GET /api/forecasting/demand/history
export async function getDemandHistory() {
  const res = await api.get("/forecasting/demand/history");
  return res.data;
}

// GET /api/forecasting/demand/ingredients?jobId=X
export async function getDemandIngredients(jobId) {
  const res = await api.get("/forecasting/demand/ingredients", { params: { jobId } });
  return res.data;
}
