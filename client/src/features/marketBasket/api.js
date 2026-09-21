import api from "@/config/axios";

export async function analyzeMarketBasketRequest(params = {}) {
  const { minSupport, minConfidence, topN } = params;
  let query = "?";
  if (minSupport) query += `minSupport=${minSupport}&`;
  if (minConfidence) query += `minConfidence=${minConfidence}&`;
  if (topN) query += `topN=${topN}&`;
  const res = await api.post(`/promotions/analyze${query}`);
  return res.data;
}

export async function getMarketBasketJobs(limit = 20) {
  const res = await api.get(`/promotions/jobs?limit=${limit}`);
  return res.data;
}

export async function getMarketBasketJob(jobId) {
  const res = await api.get(`/promotions/jobs/${jobId}`);
  return res.data;
}

export async function markComboCreatedRequest(data) {
  const res = await api.post("/promotions/mark-combo-created", data);
  return res.data;
}
