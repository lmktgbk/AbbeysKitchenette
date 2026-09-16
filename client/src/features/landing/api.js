import api from "@/config/axios";

export async function getStoreSettingsRequest() {
  const res = await api.get("/guest/settings");
  return res.data;
}
