/**
 * AnomalyDetection API — owns anomaly detection transport.
 * WHY: isolates Python-service anomaly endpoints from dashboard polling logic. Contract: GET /anomaly/results, GET /anomaly/active?severity=, GET /anomaly/stats, PATCH /anomaly/:id/acknowledge, POST /anomaly/scan; returns res.data envelope.
 * State: axios wrappers, no state.
 */
import api from "@/config/axios";

export async function getAnomalyResults(params = {}) {
  const res = await api.get("/anomaly/results", { params });
  return res.data;
}

export async function getActiveAnomalies(severity = "critical,high") {
  const res = await api.get("/anomaly/active", { params: { severity } });
  return res.data;
}

export async function getAnomalyStats() {
  const res = await api.get("/anomaly/stats");
  return res.data;
}

export async function acknowledgeAnomaly(id) {
  const res = await api.patch(`/anomaly/${id}/acknowledge`);
  return res.data;
}

export async function triggerAnomalyScan() {
  const res = await api.post("/anomaly/scan", {});
  return res.data;
}
