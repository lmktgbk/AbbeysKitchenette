import { Router } from "express";

import { authController } from "./auth.controller.js";
import { validate } from "../../middleware/validate.middleware.js";
import authenticate from "../../middleware/authenticate.middleware.js";
import { authLimiter, accountLimiter, emailChangeLimiter, loginLimiter, otpVerifyLimiter,
  otpResendLimiter, recoveryLimiter, recoveryAccountLimiter, resetLimiter } from "../../middleware/rateLimit.middleware.js";
import { uploadAvatar } from "../../middleware/upload.middleware.js";
import {
  loginSchema,
  verifyOtpSchema,
  resendOtpSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  updateProfileSchema,
  confirmEmailChangeSchema,
  changePasswordSchema,
} from "./auth.validation.js";

const router = Router();

// POST /api/auth/login — staff portal (cashier + kitchen). Admins get USE_ADMIN_PORTAL.
router.post("/login", authLimiter, loginLimiter, accountLimiter, validate(loginSchema), authController.login);

// POST /api/auth/admin-login — hidden admin portal (admin only, OTP 2FA). Not linked in UI.
router.post("/admin-login", authLimiter, loginLimiter, accountLimiter, validate(loginSchema), authController.adminLogin);

// GET /api/auth/me — current user (protected)
router.get("/me", authenticate, authController.getMe);
router.post("/realtime-ticket", authenticate, authController.realtimeTicket);

// POST /api/auth/logout — clear cookie (protected)
router.post("/logout", authenticate, authController.logout);

// POST /api/auth/verify-otp — verify OTP code, returns JWT
router.post("/verify-otp", authLimiter, otpVerifyLimiter, validate(verifyOtpSchema), authController.verifyOtp);

// POST /api/auth/resend-otp — resend OTP to email
router.post("/resend-otp", authLimiter, otpResendLimiter, validate(resendOtpSchema), authController.resendOtp);

// POST /api/auth/forgot-password — self-service for all roles (same generic response)
router.post(
  "/forgot-password",
  authLimiter,
  recoveryLimiter,
  recoveryAccountLimiter,
  validate(forgotPasswordSchema),
  authController.forgotPassword,
);

// POST /api/auth/reset-password — set new password from email link (all roles)
router.post(
  "/reset-password",
  authLimiter,
  resetLimiter,
  validate(resetPasswordSchema),
  authController.resetPassword,
);

// PATCH /api/auth/me — update own profile (protected)
router.patch(
  "/me",
  authenticate,
  emailChangeLimiter,
  validate(updateProfileSchema),
  authController.updateProfile,
);

router.post("/verify-email-change", authenticate, emailChangeLimiter, validate(confirmEmailChangeSchema), authController.confirmEmailChange);

// POST /api/auth/change-password — change own password (protected)
router.post(
  "/change-password",
  authenticate,
  validate(changePasswordSchema),
  authController.changePassword,
);

// POST /api/auth/profile-image — upload profile image (protected)
router.post(
  "/profile-image",
  authenticate,
  uploadAvatar,
  authController.uploadProfileImage,
);

export default router;
