import { Router } from "express";

import { authController } from "./auth.controller.js";
import { validate } from "../../middleware/validate.middleware.js";
import authenticate from "../../middleware/authenticate.middleware.js";
import requireStoreDevice from "../../middleware/requiredStoreDevice.middleware.js";
import {
  loginSchema,
  loginPinSchema,
  verifyOtpSchema,
  resendOtpSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePinSchema,
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

export default router;
