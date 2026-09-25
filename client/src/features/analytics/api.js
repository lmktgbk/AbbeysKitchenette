/**
 * Analytics API — owns KPI fetch + report export transport.
 * WHY: centralizes date-param normalization (camelCase to snake_case) and blob download. Contract: GET /analytics/kpis, GET /analytics/export?format=excel|pdf (blob, parses content-disposition filename, triggers download); KPI calls return res.data envelope.
 * State: axios wrappers, no state.
 */
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
  const format = params.format === "pdf" ? "pdf" : "excel";
  const res = await api.get("/analytics/export", {
    params: toSnakeParams({ format, ...params }),
    responseType: "blob",
  });
  // Server errors arrive as JSON blobs — surface the message, not a junk file.
  const contentType = res.headers["content-type"] || "";
  if (contentType.includes("application/json")) {
    const text = await res.data.text();
    let message = "Export failed";
    try {
      message = JSON.parse(text).message || message;
    } catch { /* keep default */ }
    throw new Error(message);
  }
  const disposition = res.headers["content-disposition"] || "";
  const match = disposition.match(/filename="?([^"]+)"?/);
  const filename = match ? match[1] : (format === "pdf" ? "Abbeys-KPIs.pdf" : "Abbeys-KPIs.xlsx");
  const mime = format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  const url = window.URL.createObjectURL(new Blob([res.data], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
  return res;
}
