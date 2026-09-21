import { authService } from "./auth.service.js";
import { successResponse, errorResponse } from "../../utils/response.js";
import { AppError } from "../../middleware/errorHandler.middleware.js";
import { env } from "../../config/env.js";
import { auditLogService } from "../auditLogs/auditLog.service.js";
import { ACTIONS } from "../auditLogs/auditLog.constants.js";

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "strict",
  maxAge: 8 * 60 * 60 * 1000,
  path: "/",
};

function handleError(res, error, fallbackCode) {
  if (error instanceof AppError) {
    return errorResponse(res, error.message, null, error.statusCode, error.code);
  }
  console.error(`[${fallbackCode}]`, error);
  return errorResponse(res, "Something went wrong", null, 500, fallbackCode);
}

export const authController = {
  // POST /api/auth/login — staff portal (cashier + kitchen). Blocks admins.
  async login(req, res) {
    try {
      const { email, password } = req.body;
      const result = await authService.login(email, password, req.ip);
      res.cookie("token", result.token, COOKIE_OPTIONS);
      auditLogService.logAction({ userId: result.user.id, action: ACTIONS.LOGIN_SUCCESS, details: { email, role: result.user.role } }).catch(() => {});
      return successResponse(res, "Login successful", { user: result.user, token: result.token });
    } catch (error) {
      if (error instanceof AppError && ["INVALID_CREDENTIALS", "ACCOUNT_LOCKED", "ACCOUNT_DISABLED", "STORE_IP_REQUIRED", "USE_ADMIN_PORTAL", "USE_STAFF_PORTAL"].includes(error.code)) {
        const { email } = req.body || {};
        auditLogService.logAction({ action: ACTIONS.LOGIN_FAILED, details: { email, reason: error.code } }).catch(() => {});
      }
      return handleError(res, error, "LOGIN_ERROR");
    }
  },

  // POST /api/auth/admin-login — hidden admin portal (admin only, OTP 2FA).
  async adminLogin(req, res) {
    try {
      const { email, password } = req.body;
      const result = await authService.adminLogin(email, password, req.ip);
      if (result.requiresOtp) {
        return successResponse(res, "OTP sent to email", { requiresOtp: true, user: result.user });
      }
      res.cookie("token", result.token, COOKIE_OPTIONS);
      auditLogService.logAction({ userId: result.user.id, action: ACTIONS.LOGIN_SUCCESS, details: { email, role: result.user.role } }).catch(() => {});
      return successResponse(res, "Login successful", { user: result.user, token: result.token });
    } catch (error) {
      if (error instanceof AppError && ["INVALID_CREDENTIALS", "ACCOUNT_LOCKED", "ACCOUNT_DISABLED", "STORE_IP_REQUIRED", "USE_ADMIN_PORTAL", "USE_STAFF_PORTAL"].includes(error.code)) {
        const { email } = req.body || {};
        auditLogService.logAction({ action: ACTIONS.LOGIN_FAILED, details: { email, reason: error.code } }).catch(() => {});
      }
      return handleError(res, error, "LOGIN_ERROR");
    }
  },

  async logout(req, res) {
    res.clearCookie("token", { path: "/" });
    auditLogService.logAction({ userId: req.user.id, action: ACTIONS.LOGOUT, details: { email: req.user.email } }).catch(() => {});
    return successResponse(res, "Logged out successfully");
  },

  async getMe(req, res) {
    return successResponse(res, "User retrieved", { user: req.user });
  },

  async verifyOtp(req, res) {
    try {
      const { userId, code } = req.body;
      const { token, user } = await authService.verifyOtp(userId, code);
      res.cookie("token", token, COOKIE_OPTIONS);
      auditLogService.logAction({ userId: user.id, action: ACTIONS.OTP_VERIFIED, details: { email: user.email } }).catch(() => {});
      return successResponse(res, "OTP verified", { user, token });
    } catch (error) {
      return handleError(res, error, "OTP_VERIFY_ERROR");
    }
  },

  async resendOtp(req, res) {
    try {
      const { userId } = req.body;
      await authService.resendOtp(userId);
      return successResponse(res, "OTP sent to email");
    } catch (error) {
      return handleError(res, error, "OTP_RESEND_ERROR");
    }
  },

  async forgotPassword(req, res) {
    try {
      const { email } = req.body;
      await authService.forgotPassword(email);
      return successResponse(res, "If email exists, reset link has been sent");
    } catch (error) {
      return handleError(res, error, "FORGOT_PASSWORD_ERROR");
    }
  },

  async resetPassword(req, res) {
    try {
      const { token, newPassword } = req.body;
      await authService.resetPassword(token, newPassword);
      return successResponse(res, "Password reset successful");
    } catch (error) {
      return handleError(res, error, "RESET_PASSWORD_ERROR");
    }
  },

  async updateProfile(req, res) {
    try {
      const { name, email } = req.body;
      const user = await authService.updateProfile(req.user.id, name, email);
      return successResponse(res, "Profile updated", { user });
    } catch (error) {
      return handleError(res, error, "UPDATE_PROFILE_ERROR");
    }
  },

  async changePassword(req, res) {
    try {
      const { currentPassword, newPassword } = req.body;
      await authService.changePassword(req.user.id, currentPassword, newPassword);
      auditLogService.logAction({ userId: req.user.id, action: ACTIONS.PASSWORD_CHANGED, details: { email: req.user.email } }).catch(() => {});
      return successResponse(res, "Password changed successfully");
    } catch (error) {
      return handleError(res, error, "CHANGE_PASSWORD_ERROR");
    }
  },

  async uploadProfileImage(req, res) {
    try {
      if (!req.file) {
        return errorResponse(res, "No image file provided", null, 400, "NO_FILE");
      }
      const user = await authService.uploadProfileImage(req.user.id, req.file.path);
      return successResponse(res, "Profile image updated", { user });
    } catch (error) {
      return handleError(res, error, "UPLOAD_PROFILE_IMAGE_ERROR");
    }
  },
};
