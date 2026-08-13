import api from "@/config/axios";

/* ── Login  */

/** Submit email + password — returns { user, token } or { requiresOtp, user } */
export async function loginRequest(email, password) {
  const res = await api.post("/auth/login", { email, password });
  return res.data;
}

/** PIN login — returns { user, token } */
export async function loginPinRequest(userId, pin) {
  const res = await api.post("/auth/login-pin", { userId, pin });
  return res.data;
}

/** Fetch staff list for PIN login selection grid — store IP only */
export async function getStaffListRequest() {
  const res = await api.get("/auth/staff-list");
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

/* ── Change PIN  */

/** Change own PIN after mustChangePwd */
export async function changePinRequest(newPin) {
  const res = await api.post("/auth/change-pin", { newPin });
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
