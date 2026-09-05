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
