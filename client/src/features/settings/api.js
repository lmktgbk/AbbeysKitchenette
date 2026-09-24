/**
 * Settings API — owns system-settings transport.
 * WHY: isolates global settings reads/writes from per-feature APIs. Contract: GET /settings, PATCH /settings; returns res.data envelope.
 * State: axios wrappers, no state.
 */
import api from "@/config/axios";

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
