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

// Constants
const PIN_MAX_ATTEMPTS = 5;
const PIN_LOCKOUT_MINUTES = 15;
const OTP_EXPIRY_MINUTES = 10;

// Actual Business Logic
export const authService = {
  /**
   * Email + password login.
   * Admin → returns requiresOtp (sends OTP email, no JWT yet).
   * Staff → returns JWT directly (no OTP, IP restriction checked).
   * @param {string} email
   * @param {string} password
   * @param {string} clientIP - from req.ip
   * @returns {{ token?, user, requiresOtp? }}
   */
  async login(email, password, clientIP) {
    const user = await authRepository.findByEmailWithCredentials(email);

    if (!user) {
      throw new AppError(
        401,
        "Invalid email or password",
        "INVALID_CREDENTIALS",
      );
    }

    if (!user.isActive) {
      throw new AppError(
        403,
        "Account is disabled. Contact administrator.",
        "ACCOUNT_DISABLED",
      );
    }

    // IP restriction for staff roles
    const restrictedRoles = ["cashier", "kitchen"];
    if (restrictedRoles.includes(user.role)) {
      const allowed = await isStoreIP(clientIP);
      if (!allowed) {
        throw new AppError(
          403,
          "Staff must login from store location",
          "STORE_IP_REQUIRED",
        );
      }
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      throw new AppError(
        401,
        "Invalid email or password",
        "INVALID_CREDENTIALS",
      );
    }

    // Admin → send OTP, don't issue JWT yet
    if (user.role === "admin") {
      const otpCode = generateOtp(user.id);
      await sendEmail({
        to: user.email,
        subject: "Your Verification Code — Abbey's Kitchenette",
        html: generateOtpEmail(otpCode),
      });

      const { passwordHash, pinHash, ...safeUser } = user;
      return { requiresOtp: true, user: safeUser };
    }

    // Staff → JWT directly
    await authRepository.updateLastLogin(user.id);
    const token = signToken({ sub: user.id, role: user.role });
    const { passwordHash, pinHash, ...safeUser } = user;

    return { token, user: safeUser };
  },

  /**
   * PIN login (store IP required — validated by middleware).
   * @param {string} userId - from staff grid selection
   * @param {string} pin - 4-6 digit PIN
   * @returns {{ token: string, user: object, mustChangePin?: boolean }}
   */
  async loginPin(userId, pin) {
    const user = await authRepository.findByIdWithPin(userId);

    if (!user) {
      throw new AppError(401, "Invalid PIN", "INVALID_PIN");
    }

    if (!user.isActive) {
      throw new AppError(
        403,
        "Account is disabled. Contact administrator.",
        "ACCOUNT_DISABLED",
      );
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutesLeft = Math.ceil((user.lockedUntil - new Date()) / 60000);
      throw new AppError(
        423,
        `Account locked. Try again in ${minutesLeft} minute${minutesLeft !== 1 ? "s" : ""}.`,
        "ACCOUNT_LOCKED",
      );
    }

    if (!user.pinHash) {
      throw new AppError(
        400,
        "No PIN set. Please login with email and password.",
        "NO_PIN_SET",
      );
    }

    const isPinValid = await bcrypt.compare(pin, user.pinHash);

    if (!isPinValid) {
      const updated = await authRepository.incrementFailedPinAttempts(
        user.id,
        user.failedPinAttempts,
        PIN_LOCKOUT_MINUTES,
      );

      const remaining = PIN_MAX_ATTEMPTS - updated.failedPinAttempts;

      if (remaining <= 0) {
        throw new AppError(
          423,
          "Account locked due to too many failed attempts.",
          "ACCOUNT_LOCKED",
        );
      }

      throw new AppError(
        401,
        `Invalid PIN. ${remaining} attempt${remaining !== 1 ? "s" : ""} remaining.`,
        "INVALID_PIN",
      );
    }

    await authRepository.resetFailedPinAttempts(user.id);
    await authRepository.updateLastLogin(user.id);

    const token = signToken({ sub: user.id, role: user.role });
    const { passwordHash, pinHash, ...safeUser } = user;

    return {
      token,
      user: safeUser,
      ...(user.mustChangePwd && { mustChangePin: true }),
    };
  },

  /**
   * Get all active staff for PIN login selection grid.
   * @returns {Array<{ id: string, name: string, role: string }>}
   */
  async getStaffList() {
    return authRepository.findActiveStaff();
  },

  /**
   * Verify OTP code for admin login.
   * Returns JWT on success.
   * @param {string} userId - user's UUID
   * @param {string} code - 6-digit OTP
   * @returns {{ token: string, user: object }}
   */
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

  /**
   * Resend OTP to admin email.
   * @param {string} userId - user's UUID
   */
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

  /**
   * Send password reset link to admin email.
   * Generates JWT token (15min expiry) embedded in reset URL.
   * @param {string} email - admin's email
   */
  async forgotPassword(email) {
    const user = await authRepository.findByEmail(email);

    if (!user) {
      // Don't reveal whether email exists
      return;
    }

    const resetToken = signToken(
      { sub: user.id, purpose: "password-reset" },
      "15m",
    );

    const resetUrl = `${env.CLIENT_URL}/reset-password?token=${resetToken}`;

    await sendEmail({
      to: user.email,
      subject: "Reset Your Password — Abbey's Kitchenette",
      html: generateResetPasswordEmail(resetUrl),
    });
  },

  /**
   * Reset password from email link.
   * Verifies JWT token, updates password.
   * @param {string} token - JWT token from email link
   * @param {string} newPassword - new password (min 8 chars)
   */
  async resetPassword(token, newPassword) {
    const { verifyToken } = await import("../../config/jwt.js");
    let decoded;

    try {
      decoded = verifyToken(token);
    } catch {
      throw new AppError(
        401,
        "Invalid or expired reset token",
        "INVALID_TOKEN",
      );
    }

    if (decoded.purpose !== "password-reset") {
      throw new AppError(401, "Invalid token purpose", "INVALID_TOKEN");
    }

    const user = await authRepository.findById(decoded.sub);

    if (!user) {
      throw new AppError(401, "User not found", "USER_NOT_FOUND");
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await authRepository.updatePassword(user.id, passwordHash);
  },

  /**
   * Change own PIN after mustChangePwd.
   * @param {string} userId - user's UUID
   * @param {string} newPin - 4-6 digit PIN
   */
  async changePin(userId, newPin) {
    const user = await authRepository.findByIdWithPin(userId);

    if (!user) {
      throw new AppError(401, "User not found", "USER_NOT_FOUND");
    }

    const pinHash = await bcrypt.hash(newPin, 10);
    await authRepository.updatePin(userId, pinHash);
    await authRepository.setMustChangePwd(userId, false);
  },
};
