import bcrypt from "bcryptjs";

import { authRepository } from "./auth.repository.js";
import { AppError } from "../../middleware/errorHandler.middleware.js";
import { signToken } from "../../config/jwt.js";
import { isStoreIP } from "../../utils/ipCheck.js";
import { generateOtp, verifyOtp as verifyOtpCode } from "../../utils/otp.js";
import {
  sendEmail,
  generateResetPasswordEmail,
  generateOtpEmail,
} from "../../utils/email.js";
import { env } from "../../config/env.js";
import { deleteImage } from "../../utils/cloudinary.js";

// Constants
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MINUTES = 15;
const OTP_EXPIRY_MINUTES = 10;

export const authService = {
  // Staff portal: cashier + kitchen only. Admins are redirected to /admin-login.
  async login(email, password, clientIP) {
    return this._loginCore(email, password, clientIP, "staff");
  },

  // Hidden admin portal: admin only, with OTP 2FA.
  async adminLogin(email, password, clientIP) {
    return this._loginCore(email, password, clientIP, "admin");
  },

  async _loginCore(email, password, clientIP, portal) {
    const user = await authRepository.findByEmailWithCredentials(email);

    if (!user) {
      throw new AppError(401, "Invalid email or password", "INVALID_CREDENTIALS");
    }

    if (portal === "staff" && user.role === "admin") {
      throw new AppError(403, "Admins must use the admin login page", "USE_ADMIN_PORTAL");
    }

    if (portal === "admin" && user.role !== "admin") {
      throw new AppError(403, "Staff must use the staff login page", "USE_STAFF_PORTAL");
    }

    if (!user.isActive) {
      throw new AppError(403, "Account is disabled. Contact administrator.", "ACCOUNT_DISABLED");
    }

    // IP restriction for staff roles
    const restrictedRoles = ["cashier", "kitchen"];
    if (restrictedRoles.includes(user.role)) {
      const allowed = await isStoreIP(clientIP);
      if (!allowed) {
        throw new AppError(403, "Staff must login from store location", "STORE_IP_REQUIRED");
      }
    }

    // Lockout check
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutesLeft = Math.ceil((user.lockedUntil - new Date()) / 60000);
      throw new AppError(423, `Account locked. Try again in ${minutesLeft} minute${minutesLeft !== 1 ? "s" : ""}.`, "ACCOUNT_LOCKED");
    }
    if (user.lockedUntil && user.lockedUntil <= new Date()) {
      await authRepository.resetFailedLoginAttempts(user.id);
      user.failedLoginAttempts = 0;
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      const updated = await authRepository.incrementFailedLoginAttempts(user.id, user.failedLoginAttempts || 0, LOGIN_LOCKOUT_MINUTES);
      const remaining = LOGIN_MAX_ATTEMPTS - updated.failedLoginAttempts;
      if (remaining <= 0) {
        throw new AppError(423, "Account locked due to too many failed attempts.", "ACCOUNT_LOCKED");
      }
      throw new AppError(401, "Invalid email or password", "INVALID_CREDENTIALS");
    }

    await authRepository.resetFailedLoginAttempts(user.id);

    // Admin → send OTP, don't issue JWT yet
    if (user.role === "admin") {
      const otpCode = generateOtp(user.id);
      await sendEmail({
        to: user.email,
        subject: "Your Verification Code — Abbey's Kitchenette",
        html: generateOtpEmail(otpCode),
      });
      const { passwordHash, ...safeUser } = user;
      return { requiresOtp: true, user: safeUser };
    }

    // Staff → JWT directly
    await authRepository.updateLastLogin(user.id);
    const token = signToken({ sub: user.id, role: user.role });
    const { passwordHash, ...safeUser } = user;
    return { token, user: safeUser };
  },

  async verifyOtp(userId, code) {
    const isValid = verifyOtpCode(userId, code);
    if (!isValid) {
      throw new AppError(401, "Invalid or expired OTP code", "INVALID_OTP");
    }
    const user = await authRepository.findById(userId);
    if (!user) {
      throw new AppError(401, "User not found", "USER_NOT_FOUND");
    }
    await authRepository.updateLastLogin(user.id);
    const token = signToken({ sub: user.id, role: user.role });
    return { token, user };
  },

  async resendOtp(userId) {
    const user = await authRepository.findById(userId);
    if (!user) {
      throw new AppError(401, "User not found", "USER_NOT_FOUND");
    }
    const otpCode = generateOtp(user.id);
    await sendEmail({
      to: user.email,
      subject: "Your New Verification Code — Abbey's Kitchenette",
      html: generateOtpEmail(otpCode),
    });
  },

  async forgotPassword(email) {
    const user = await authRepository.findByEmail(email);
    // Admin-only self-service. Staff accounts cannot use forgot-password:
    // silently skip (same generic response) to avoid account enumeration.
    if (!user || user.role !== "admin") {
      return;
    }
    const resetToken = signToken({ sub: user.id, purpose: "password-reset" }, "15m");
    const resetUrl = `${env.CLIENT_URL}/reset-password?token=${resetToken}`;
    await sendEmail({
      to: user.email,
      subject: "Reset Your Password — Abbey's Kitchenette",
      html: generateResetPasswordEmail(resetUrl),
    });
  },

  async resetPassword(token, newPassword) {
    const { verifyToken } = await import("../../config/jwt.js");
    let decoded;
    try {
      decoded = verifyToken(token);
    } catch {
      throw new AppError(401, "Invalid or expired reset token", "INVALID_TOKEN");
    }
    if (decoded.purpose !== "password-reset") {
      throw new AppError(401, "Invalid token purpose", "INVALID_TOKEN");
    }
    const user = await authRepository.findById(decoded.sub);
    if (!user) {
      throw new AppError(401, "User not found", "USER_NOT_FOUND");
    }
    // Reset links are only ever issued to admins (see forgotPassword).
    if (user.role !== "admin") {
      throw new AppError(403, "Password reset is for admins only", "FORBIDDEN");
    }
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await authRepository.updatePassword(user.id, passwordHash);
    await authRepository.setMustChangePwd(user.id, false);
    await authRepository.resetFailedLoginAttempts(user.id);
  },

  async updateProfile(userId, name, email) {
    const isTaken = await authRepository.isEmailTaken(email, userId);
    if (isTaken) {
      throw new AppError(409, "Email is already taken by another account", "EMAIL_TAKEN");
    }
    return authRepository.updateProfile(userId, { name, email });
  },

  async changePassword(userId, currentPassword, newPassword) {
    const passwordHash = await authRepository.getPasswordHash(userId);
    if (!passwordHash) {
      throw new AppError(401, "User not found", "USER_NOT_FOUND");
    }
    const isCurrentValid = await bcrypt.compare(currentPassword, passwordHash);
    if (!isCurrentValid) {
      throw new AppError(401, "Current password is incorrect", "INVALID_PASSWORD");
    }
    const newHash = await bcrypt.hash(newPassword, 10);
    await authRepository.updatePassword(userId, newHash);
    // First-login / admin-reset flow completes here.
    await authRepository.setMustChangePwd(userId, false);
  },

  async uploadProfileImage(userId, imageUrl) {
    const user = await authRepository.findById(userId);
    if (!user) {
      throw new AppError(401, "User not found", "USER_NOT_FOUND");
    }
    if (user.imageUrl && user.imageUrl !== imageUrl) {
      await deleteImage(user.imageUrl);
    }
    return authRepository.updateImageUrl(userId, imageUrl);
  },
};
