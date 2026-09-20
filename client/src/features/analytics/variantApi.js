import api from "@/config/axios";

export async function getVariantProfitabilityRequest(params = {}) {
  const res = await api.get("/analytics/variants/profitability", { params });
  return res.data;
}

export async function getWasteDetailsRequest(params = {}) {
  const res = await api.get("/analytics/waste/details", { params });
  return res.data;
}
