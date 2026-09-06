import { authService } from "./auth.service.js";
import { authRepository } from "./auth.repository.js";
import { successResponse, errorResponse } from "../../utils/response.js";
import { AppError } from "../../middleware/errorHandler.middleware.js";
import { env } from "../../config/env.js";
import { auditLogService } from "../auditLogs/auditLog.service.js";
import { ACTIONS } from "../auditLogs/auditLog.constants.js";

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "strict",
  maxAge: 8 * 60 * 60 * 1000, // 8hrs
  path: "/",
};

/**
 * Wraps error response logic: AppError → show message, unexpected → generic.
 */
function handleError(res, error, fallbackCode) {
  if (error instanceof AppError) {
    return errorResponse(
      res,
      error.message,
      null,
      error.statusCode,
      error.code,
    );
  }
  console.error(`[${fallbackCode}]`, error);
  return errorResponse(res, "Something went wrong", null, 500, fallbackCode);
}

export const authController = {
  /**
   * POST /login
   * Email + password login.
   * Admin → returns requiresOtp (no cookie yet).
   * Staff → sets cookie and returns token.
   */
  async login(req, res) {
    try {
      const { email, password } = req.body;
      const result = await authService.login(email, password, req.ip);

      if (result.requiresOtp) {
        return successResponse(res, "OTP sent to email", {
          requiresOtp: true,
          user: result.user,
        });
      }

      res.cookie("token", result.token, COOKIE_OPTIONS);
      auditLogService.logAction({
        userId: result.user.id,
        action: ACTIONS.LOGIN_SUCCESS,
        details: { email, role: result.user.role },
      }).catch(() => {});
      return successResponse(res, "Login successful", {
        user: result.user,
        token: result.token,
      });
    } catch (error) {
      if (error instanceof AppError && error.code === "INVALID_CREDENTIALS") {
        const { email } = req.body || {};
        auditLogService.logAction({
          action: ACTIONS.LOGIN_FAILED,
          details: { email },
        }).catch(() => {});
      }
      return handleError(res, error, "LOGIN_ERROR");
    }
  },

  /**
   * POST /login-pin
   * PIN-based login (store IP required).
   * Sets cookie on success.
   */
  async loginPin(req, res) {
    try {
      const { userId, pin } = req.body;
      const { token, user, mustChangePin } = await authService.loginPin(
        userId,
        pin,
      );

      res.cookie("token", token, COOKIE_OPTIONS);
      auditLogService.logAction({
        userId: user.id,
        action: ACTIONS.LOGIN_SUCCESS,
        details: { role: user.role },
      }).catch(() => {});
      return successResponse(res, "Login successful", {
        user,
        token,
        ...(mustChangePin && { mustChangePin: true }),
      });
    } catch (error) {
      if (error instanceof AppError && ["INVALID_PIN", "ACCOUNT_LOCKED", "ACCOUNT_DISABLED", "NO_PIN_SET"].includes(error.code)) {
        const targetUser = await authRepository.findById(req.body.userId).catch(() => null);
        auditLogService.logAction({
          userId: targetUser?.id || null,
          action: ACTIONS.LOGIN_FAILED,
          details: { reason: error.code },
        }).catch(() => {});
      }
      return handleError(res, error, "PIN_LOGIN_ERROR");
    }
  },

  /**
   * POST /logout
   * Clear authentication cookie.
   */
  async logout(req, res) {
    res.clearCookie("token", { path: "/" });
    auditLogService.logAction({
      userId: req.user.id,
      action: ACTIONS.LOGOUT,
      details: { email: req.user.email },
    }).catch(() => {});
    return successResponse(res, "Logged out successfully");
  },

  /**
   * GET /me
   * Return current authenticated user.
   */
  async getMe(req, res) {
    return successResponse(res, "User retrieved", { user: req.user });
  },

  /**
   * GET /staff-list
   * Return active staff for PIN login grid (store IP required).
   */
  async getStaffList(req, res) {
    try {
      const staff = await authService.getStaffList();
      return successResponse(res, "Staff list retrieved", { staff });
    } catch (error) {
      return handleError(res, error, "STAFF_LIST_ERROR");
    }
  },

  /**
   * POST /verify-otp
   * Verify OTP code for admin login.
   * Sets cookie on success.
   */
  async verifyOtp(req, res) {
    try {
      const { userId, code } = req.body;
      const { token, user } = await authService.verifyOtp(userId, code);

      res.cookie("token", token, COOKIE_OPTIONS);
      auditLogService.logAction({
        userId: user.id,
        action: ACTIONS.OTP_VERIFIED,
        details: { email: user.email },
      }).catch(() => {});
      return successResponse(res, "OTP verified", { user, token });
    } catch (error) {
      return handleError(res, error, "OTP_VERIFY_ERROR");
    }
  },

  /**
   * POST /resend-otp
   * Resend OTP to admin email.
   */
  async resendOtp(req, res) {
    try {
      const { userId } = req.body;
      await authService.resendOtp(userId);

      return successResponse(res, "OTP sent to email");
    } catch (error) {
      return handleError(res, error, "OTP_RESEND_ERROR");
    }
  },

  /**
   * POST /forgot-password
   * Send password reset link to admin email.
   * Always returns success (don't reveal if email exists).
   */
  async forgotPassword(req, res) {
    try {
      const { email } = req.body;
      await authService.forgotPassword(email);

      return successResponse(res, "If email exists, reset link has been sent");
    } catch (error) {
      return handleError(res, error, "FORGOT_PASSWORD_ERROR");
    }
  },

  /**
   * POST /reset-password
   * Reset password from email link (token in body).
   */
  async resetPassword(req, res) {
    try {
      const { token, newPassword } = req.body;
      await authService.resetPassword(token, newPassword);

      return successResponse(res, "Password reset successful");
    } catch (error) {
      return handleError(res, error, "RESET_PASSWORD_ERROR");
    }
  },

  /**
   * POST /change-pin
   * Change own PIN after mustChangePwd.
   */
  async changePin(req, res) {
    try {
      const { newPin } = req.body;
      await authService.changePin(req.user.id, newPin);

      auditLogService.logAction({
        userId: req.user.id,
        action: ACTIONS.PIN_CHANGED,
        details: { email: req.user.email },
      }).catch(() => {});
      return successResponse(res, "PIN changed successfully");
    } catch (error) {
      return handleError(res, error, "CHANGE_PIN_ERROR");
    }
  },

  /**
   * PATCH /me
   * Update own profile (name and email).
   */
  async updateProfile(req, res) {
    try {
      const { name, email } = req.body;
      const user = await authService.updateProfile(req.user.id, name, email);

      return successResponse(res, "Profile updated", { user });
    } catch (error) {
      return handleError(res, error, "UPDATE_PROFILE_ERROR");
    }
  },

  /**
   * POST /change-password
   * Change own password (requires current password).
   */
  async changePassword(req, res) {
    try {
      const { currentPassword, newPassword } = req.body;
      await authService.changePassword(
        req.user.id,
        currentPassword,
        newPassword,
      );

      auditLogService.logAction({
        userId: req.user.id,
        action: ACTIONS.PASSWORD_CHANGED,
        details: { email: req.user.email },
      }).catch(() => {});
      return successResponse(res, "Password changed successfully");
    } catch (error) {
      return handleError(res, error, "CHANGE_PASSWORD_ERROR");
    }
  },

  /**
   * POST /profile-image
   * Upload or replace profile image.
   */
  async uploadProfileImage(req, res) {
    try {
      if (!req.file) {
        return errorResponse(res, "No image file provided", null, 400, "NO_FILE");
      }

      const user = await authService.uploadProfileImage(
        req.user.id,
        req.file.path,
      );

      return successResponse(res, "Profile image updated", { user });
    } catch (error) {
      return handleError(res, error, "UPLOAD_PROFILE_IMAGE_ERROR");
    }
  },
};
