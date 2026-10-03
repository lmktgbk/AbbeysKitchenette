import { authService } from "./auth.service.js";
import { successResponse, errorResponse, controllerError } from "../../utils/response.js";
import { AppError } from "../../middleware/errorHandler.middleware.js";

/**
 * Auth Controller
 *
 * Thin HTTP layer over authService. Owns the session cookie (httpOnly,
 * 8h, configured SameSite policy) — login/adminLogin set it, logout clears it. Login handlers
 * special-case credential AppErrors inline (instead of plain handleError)
 * to keep brute-force responses indistinguishable across portals.
 */
import { sessionCookieOptions } from "../../config/cookies.js";
import { auditLogService } from "../auditLogs/auditLog.service.js";
import { ACTIONS } from "../auditLogs/auditLog.constants.js";

const COOKIE_OPTIONS = sessionCookieOptions();

const CHALLENGE_COOKIE = "login_challenge";
const CHALLENGE_OPTIONS = { ...COOKIE_OPTIONS, path: "/api/auth", maxAge: 10 * 60 * 1000 };

function clearChallenge(res) {
  res.clearCookie(CHALLENGE_COOKIE, { ...CHALLENGE_OPTIONS, maxAge: undefined });
}

function handleError(res, error, fallbackCode) {
  return controllerError(res, error, fallbackCode);
}

export const authController = {
  // POST /api/auth/login — staff portal (cashier + kitchen). Blocks admins.
  async login(req, res) {
    try {
      const { email, password } = req.body;
      const result = await authService.login(email, password, req.ip);
      if (result.requiresOtp) {
        res.cookie(CHALLENGE_COOKIE, result.challenge, CHALLENGE_OPTIONS);
        return successResponse(res, "OTP sent to email", { requiresOtp: true, user: result.user });
      }
      res.cookie("token", result.token, COOKIE_OPTIONS);
      auditLogService.logAction({ userId: result.user.id, action: ACTIONS.LOGIN_SUCCESS, details: { email, role: result.user.role } }).catch(() => {});
      return successResponse(res, "Login successful", { user: result.user });
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
        res.cookie(CHALLENGE_COOKIE, result.challenge, CHALLENGE_OPTIONS);
        return successResponse(res, "OTP sent to email", { requiresOtp: true, user: result.user });
      }
      res.cookie("token", result.token, COOKIE_OPTIONS);
      auditLogService.logAction({ userId: result.user.id, action: ACTIONS.LOGIN_SUCCESS, details: { email, role: result.user.role } }).catch(() => {});
      return successResponse(res, "Login successful", { user: result.user });
    } catch (error) {
      if (error instanceof AppError && ["INVALID_CREDENTIALS", "ACCOUNT_LOCKED", "ACCOUNT_DISABLED", "STORE_IP_REQUIRED", "USE_ADMIN_PORTAL", "USE_STAFF_PORTAL"].includes(error.code)) {
        const { email } = req.body || {};
        auditLogService.logAction({ action: ACTIONS.LOGIN_FAILED, details: { email, reason: error.code } }).catch(() => {});
      }
      return handleError(res, error, "LOGIN_ERROR");
    }
  },

  async logout(req, res) {
    try {
      await authService.logout(req.user.id, req.sessionVersion);
      res.clearCookie("token", { ...COOKIE_OPTIONS, maxAge: undefined });
      clearChallenge(res);
      auditLogService.logAction({ userId: req.user.id, action: ACTIONS.LOGOUT, details: { email: req.user.email } }).catch(() => {});
      return successResponse(res, "Logged out successfully");
    } catch (error) {
      return handleError(res, error, "LOGOUT_ERROR");
    }
  },

  async getMe(req, res) {
    return successResponse(res, "User retrieved", { user: req.user });
  },

  async verifyOtp(req, res) {
    try {
      const { userId, code } = req.body;
      const { token, user } = await authService.verifyOtp(userId, code, req.cookies?.[CHALLENGE_COOKIE], req.ip);
      res.cookie("token", token, COOKIE_OPTIONS);
      clearChallenge(res);
      auditLogService.logAction({ userId: user.id, action: ACTIONS.OTP_VERIFIED, details: { email: user.email } }).catch(() => {});
      return successResponse(res, "OTP verified", { user });
    } catch (error) {
      return handleError(res, error, "OTP_VERIFY_ERROR");
    }
  },

  async resendOtp(req, res) {
    try {
      const { userId } = req.body;
      await authService.resendOtp(userId, req.cookies?.[CHALLENGE_COOKIE], req.ip);
      return successResponse(res, "OTP sent to email");
    } catch (error) {
      return handleError(res, error, "OTP_RESEND_ERROR");
    }
  },

  async forgotPassword(req, res) {
    try {
      const { email } = req.body;
      const user = await authService.forgotPassword(email);
      // Audit only real sends — unknown/inactive addresses stay silent
      // so logs can't be used to enumerate accounts.
      if (user) {
        auditLogService.logAction({ userId: user.id, action: ACTIONS.PASSWORD_RESET_REQUESTED, details: { email: user.email, role: user.role } }).catch(() => {});
      }
      return successResponse(res, "If email exists, reset link has been sent");
    } catch (error) {
      return handleError(res, error, "FORGOT_PASSWORD_ERROR");
    }
  },

  async resetPassword(req, res) {
    try {
      const { token, newPassword } = req.body;
      const user = await authService.resetPassword(token, newPassword);
      res.clearCookie("token", { ...COOKIE_OPTIONS, maxAge: undefined });
      clearChallenge(res);
      auditLogService.logAction({ userId: user.id, action: ACTIONS.PASSWORD_RESET, details: { email: user.email, role: user.role } }).catch(() => {});
      return successResponse(res, "Password reset successful");
    } catch (error) {
      return handleError(res, error, "RESET_PASSWORD_ERROR");
    }
  },

  async updateProfile(req, res) {
    try {
      const { name, email, currentPassword } = req.body;
      const result = await authService.updateProfile(req.user.id, name, email, currentPassword, req.sessionVersion);
      auditLogService.logAction({
        userId: req.user.id,
        action: ACTIONS.PROFILE_UPDATED,
        targetType: "staff",
        targetId: req.user.id,
        details: { fields: result.emailChange ? ["email-change-request"] : ["name"] },
      }).catch(() => {});
      return successResponse(res, result.emailChange ? "Verification sent; current email remains active" : "Profile updated", result);
    } catch (error) {
      return handleError(res, error, "UPDATE_PROFILE_ERROR");
    }
  },

  async confirmEmailChange(req, res) {
    try {
      const { id, code } = req.body;
      const { user, token } = await authService.confirmEmailChange(req.user.id, req.sessionVersion, id, code);
      res.cookie("token", token, COOKIE_OPTIONS);
      clearChallenge(res);
      auditLogService.logAction({ userId: user.id, action: ACTIONS.PROFILE_UPDATED,
        targetType: "staff", targetId: user.id, details: { fields: ["email"], verified: true } }).catch(() => {});
      return successResponse(res, "Email verified; other sessions revoked", { user });
    } catch (error) { return handleError(res, error, "EMAIL_CHANGE_ERROR"); }
  },

  async changePassword(req, res) {
    try {
      const { currentPassword, newPassword } = req.body;
      const { token, user } = await authService.changePassword(req.user.id, currentPassword, newPassword);
      res.cookie("token", token, COOKIE_OPTIONS);
      clearChallenge(res);
      auditLogService.logAction({ userId: req.user.id, action: ACTIONS.PASSWORD_CHANGED, details: { email: req.user.email } }).catch(() => {});
      return successResponse(res, "Password changed successfully", { user });
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
