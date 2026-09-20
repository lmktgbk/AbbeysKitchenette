import api from "@/config/axios";

function toSnakeParams(params = {}) {
  const out = {};
  if (params.dateFrom) out.date_from = params.dateFrom;
  if (params.dateTo) out.date_to = params.dateTo;
  if (params.date_from) out.date_from = params.date_from;
  if (params.date_to) out.date_to = params.date_to;
  // pass through non-date keys
  for (const [k, v] of Object.entries(params)) {
    if (!["dateFrom", "dateTo", "date_from", "date_to"].includes(k)) out[k] = v;
  }
  return out;
}

export async function getAnalyticsKpisRequest(params = {}) {
  const res = await api.get("/analytics/kpis", { params: toSnakeParams(params) });
  return res.data;
}

export async function exportAnalyticsRequest(params = {}) {
  const res = await api.get("/analytics/export", {
    params: toSnakeParams(params),
    responseType: "blob",
  });
  const disposition = res.headers["content-disposition"] || "";
  const match = disposition.match(/filename="?([^"]+)"?/);
  const filename = match ? match[1] : "Abbeys-KPIs.xlsx";
  const url = window.URL.createObjectURL(new Blob([res.data]));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
  return res;
}
