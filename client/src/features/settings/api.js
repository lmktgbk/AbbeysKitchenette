/**
 * Settings API — owns system-settings transport.
 * WHY: isolates global settings reads/writes from per-feature APIs. Contract: GET /settings, PATCH /settings; returns res.data envelope.
 * State: axios wrappers, no state.
 */
import api from "@/config/axios";

/** Compare this browser request's backend address with the saved network policy. */
export async function checkNetworkRequest() {
  const res = await api.get("/settings/network");
  return res.data;
}

/** Get current system settings */
export async function getSettingsRequest() {
  const res = await api.get("/settings");
  return res.data;
}

/** Update system settings */
export async function updateSettingsRequest(data) {
  const res = await api.patch("/settings", data);
  return res.data;
}
