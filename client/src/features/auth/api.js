import api from "@/config/axios";

/* ── Login  */

/** Staff login (cashier + kitchen) — admins get USE_ADMIN_PORTAL */
export async function loginRequest(email, password) {
  const res = await api.post("/auth/login", { email, password });
  return res.data;
}

/** Hidden admin login (admin only, OTP 2FA) */
export async function adminLoginRequest(email, password) {
  const res = await api.post("/auth/admin-login", { email, password });
  return res.data;
}

/* ── OTP (Admin 2FA)  */

/** Verify OTP code — returns { user, token } */
export async function verifyOtpRequest(userId, code) {
  const res = await api.post("/auth/verify-otp", { userId, code });
  return res.data;
}

/** Resend OTP to email */
export async function resendOtpRequest(userId) {
  const res = await api.post("/auth/resend-otp", { userId });
  return res.data;
}

/* ── Password Reset  */

/** Send password reset link to email */
export async function forgotPasswordRequest(email) {
  const res = await api.post("/auth/forgot-password", { email });
  return res.data;
}

/** Reset password from email link */
export async function resetPasswordRequest(token, newPassword) {
  const res = await api.post("/auth/reset-password", { token, newPassword });
  return res.data;
}

/* ── Session  */

/** Fetch currently authenticated user — used by AuthProvider on mount */
export async function getMeRequest() {
  const res = await api.get("/auth/me");
  return res.data;
}

/** Log out — clears httpOnly cookie */
export async function logoutRequest() {
  const res = await api.post("/auth/logout");
  return res.data;
}

/** First-login / forced change (authenticated, clears mustChangePwd) */
export async function changePasswordRequest(currentPassword, newPassword) {
  const res = await api.post("/auth/change-password", { currentPassword, newPassword });
  return res.data;
}
