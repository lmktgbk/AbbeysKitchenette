import { Router } from "express";

import { authController } from "./auth.controller.js";
import { validate } from "../../middleware/validate.middleware.js";
import authenticate from "../../middleware/authenticate.middleware.js";
import requireStoreDevice from "../../middleware/requiredStoreDevice.middleware.js";
import { uploadAvatar } from "../../middleware/upload.middleware.js";
import {
  loginSchema,
  loginPinSchema,
  verifyOtpSchema,
  resendOtpSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePinSchema,
  updateProfileSchema,
  changePasswordSchema,
} from "./auth.validation.js";

const router = Router();

// POST /api/auth/login — email + password (all roles)
router.post("/login", validate(loginSchema), authController.login);

// POST /api/auth/login-pin — PIN login (store IP only)
router.post(
  "/login-pin",
  validate(loginPinSchema),
  requireStoreDevice,
  authController.loginPin,
);

// GET /api/auth/staff-list — staff grid for PIN login (store IP only)
router.get("/staff-list", requireStoreDevice, authController.getStaffList);

// GET /api/auth/me — current user (protected)
router.get("/me", authenticate, authController.getMe);

// POST /api/auth/logout — clear cookie (protected)
router.post("/logout", authenticate, authController.logout);

// POST /api/auth/verify-otp — verify OTP code, returns JWT
router.post("/verify-otp", validate(verifyOtpSchema), authController.verifyOtp);

// POST /api/auth/resend-otp — resend OTP to email
router.post("/resend-otp", validate(resendOtpSchema), authController.resendOtp);

// POST /api/auth/forgot-password — send reset link to email
router.post(
  "/forgot-password",
  validate(forgotPasswordSchema),
  authController.forgotPassword,
);

// POST /api/auth/reset-password — reset password from email link
router.post(
  "/reset-password",
  validate(resetPasswordSchema),
  authController.resetPassword,
);

// POST /api/auth/change-pin — change own PIN (protected, store IP)
router.post(
  "/change-pin",
  authenticate,
  requireStoreDevice,
  validate(changePinSchema),
  authController.changePin,
);

// PATCH /api/auth/me — update own profile (protected)
router.patch(
  "/me",
  authenticate,
  validate(updateProfileSchema),
  authController.updateProfile,
);

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
