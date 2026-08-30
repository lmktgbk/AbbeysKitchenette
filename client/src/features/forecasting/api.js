import api from "@/config/axios";

/**
 * Forecasting API
 *
 * All requests go through Express proxy → Python FastAPI service.
 */

// GET /api/forecasting/sales
export async function getSalesForecastRequest(params = {}) {
  const res = await api.get("/forecasting/sales", { params });
  return res.data;
}

// GET /api/forecasting/restock
export async function getRestockForecastRequest() {
  const res = await api.get("/forecasting/restock");
  return res.data;
}

// GET /api/forecasting/popularity
export async function getPopularityRequest(params = {}) {
  const res = await api.get("/forecasting/popularity", { params });
  return res.data;
}
