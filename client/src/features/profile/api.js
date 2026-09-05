import api from "@/config/axios";

/* ── Profile */

/** Update own name and email */
export async function updateProfileRequest(data) {
  const res = await api.patch("/auth/me", data);
  return res.data;
}

/** Change own password */
export async function changePasswordRequest(data) {
  const res = await api.post("/auth/change-password", data);
  return res.data;
}

/** Upload or replace profile image */
export async function uploadImageRequest(file) {
  const formData = new FormData();
  formData.append("image", file);
  const res = await api.post("/auth/profile-image", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data;
}
