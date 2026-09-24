/**
 * Landing API — owns public store-settings transport.
 * WHY: separates unauthed guest settings fetch from authed settings feature. Contract: GET /guest/settings; returns res.data envelope.
 * State: axios wrappers, no state.
 */
import api from "@/config/axios";

export async function getStoreSettingsRequest() {
  const res = await api.get("/guest/settings");
  return res.data;
}
