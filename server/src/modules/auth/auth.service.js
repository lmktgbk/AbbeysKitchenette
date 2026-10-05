import { sendAuthEmail } from "./auth.effects.js";
import { emailChange } from "./auth.emailChange.js";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";

import { authRepository } from "./auth.repository.js";
import { AppError } from "../../middleware/errorHandler.middleware.js";
import { signToken, signSessionToken, verifyToken } from "../../config/jwt.js";
import { publicUser } from "./auth.session.js";
import { revokeLocalSessions } from "../../realtime/sessions.js";
import { isStoreIP } from "../../utils/ipCheck.js";
import { generateOtp, discardOtp, verifyOtp as verifyOtpCode } from "./auth.otp.js";
import {
  generateResetPasswordEmail,
  generateOtpEmail,
} from "../../utils/email.js";
import { env } from "../../config/env.js";
import { deleteImage } from "../../infrastructure/storage/imageCleanup.js";

// Brute-force budget: 5 strikes per account, then a 15-minute lockout.
// Mirrored by the route-level accountLimiter (10/15m) as the outer net.
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MINUTES = 15;

export const authService = {
  // Separate portals, identical failure shape: staff portal is cashier +
  // kitchen only, admin portal is admin only — but neither reveals the other.
  // Both portals are Gmail-OTP-gated (same 2FA format for every role).
  // Staff portal: cashier + kitchen only. Admins are redirected to /admin-login.
  async login(email, password, clientIP) {
    return this._loginCore(email, password, clientIP, "staff");
  },

  // Hidden admin portal: admin only, with OTP 2FA.
  async adminLogin(email, password, clientIP) {
    return this._loginCore(email, password, clientIP, "admin");
  },

  /** Verify portal, location, lockout, and password before issuing an OTP challenge, never a session JWT. */
  async _loginCore(email, password, clientIP, portal) {
    const user = await authRepository.findByEmailWithCredentials(email);

    if (!user) {
      throw new AppError(401, "Invalid email or password", "INVALID_CREDENTIALS");
    }

    // No portal-specific errors: wrong-portal logins return the same generic
    // credentials error so neither portal reveals the other's existence.
    if ((portal === "staff" && user.role === "admin") || (portal === "admin" && user.role !== "admin")) {
      throw new AppError(401, "Invalid email or password", "INVALID_CREDENTIALS");
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

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      const updated = await authRepository.incrementFailedLoginAttempts(user.id, LOGIN_LOCKOUT_MINUTES);
      const remaining = LOGIN_MAX_ATTEMPTS - updated.failedLoginAttempts;
      if (remaining <= 0) {
        throw new AppError(423, "Account locked due to too many failed attempts.", "ACCOUNT_LOCKED");
      }
      throw new AppError(401, "Invalid email or password", "INVALID_CREDENTIALS");
    }

    await authRepository.resetFailedLoginAttempts(user.id);

    // Every role → Gmail OTP 2FA (same format as admin), no JWT until verified.
    const challengeId = crypto.randomUUID();
    const challenge = signToken({ sub: user.id, purpose: "login-challenge", challengeId,
      role: user.role, version: user.sessionVersion }, "10m");
    const claims = verifyToken(challenge, "login-challenge");
    const otpCode = await generateOtp(user.id, challengeId, new Date(claims.exp * 1000), false, user);
    await this._sendLoginCode(user, challengeId, otpCode);
    return { requiresOtp: true, user: publicUser(user), challenge };
  },

  async verifyOtp(userId, code, challenge, clientIP) {
    const { user, claims } = await this._resolveChallenge(userId, challenge, clientIP);
    await verifyOtpCode(userId, claims.challengeId, code, user);
    const token = signSessionToken(user);
    return { token, user: publicUser(user) };
  },

  async resendOtp(userId, challenge, clientIP) {
    const { user, claims } = await this._resolveChallenge(userId, challenge, clientIP);
    const otpCode = await generateOtp(user.id, claims.challengeId, new Date(claims.exp * 1000), true, user);
    await this._sendLoginCode(user, claims.challengeId, otpCode);
  },

  async _sendLoginCode(user, challengeId, code) {
    await sendAuthEmail({ to: user.email, subject: "Your Verification Code — Abbey's Kitchenette", html: generateOtpEmail(code) },
      { userId: user.id, context: "login-otp", requestId: challengeId },
      () => discardOtp(user.id, challengeId, code));
  },

  /** Resolve only a login-purpose token and recheck current account/location before code operations. */
  async _resolveChallenge(userId, challenge, clientIP) {
    let claims;
    try {
      claims = verifyToken(challenge, "login-challenge");
    } catch {
      throw new AppError(401, "Login challenge expired, please sign in again", "INVALID_CHALLENGE");
    }
    if (claims.sub !== userId || typeof claims.challengeId !== "string" || !Number.isSafeInteger(claims.version)) {
      throw new AppError(401, "Invalid login challenge", "INVALID_CHALLENGE");
    }
    const user = await authRepository.findSecurityState(userId);
    if (!user?.isActive || user.role !== claims.role || user.sessionVersion !== claims.version) {
      throw new AppError(401, "Account changed, please sign in again", "INVALID_CHALLENGE");
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new AppError(423, "Account is locked, please try again later", "ACCOUNT_LOCKED");
    }
    if (user.role !== "admin" && !await isStoreIP(clientIP)) {
      throw new AppError(403, "Staff must login from store location", "STORE_IP_REQUIRED");
    }
    return { user, claims };
  },

  /** Persist version-based revocation before closing this process's authenticated WebSocket sessions. */
  async logout(userId, version) {
    await authRepository.revokeSessions(userId, version);
    revokeLocalSessions(userId);
  },

  async forgotPassword(email) {
    const user = await authRepository.findByEmail(email);
    // Self-service for all roles (admin + staff). Silently skip unknown or
    // inactive accounts with the same generic response to avoid enumeration.
    // The HTTP response remains generic, including mail failures.
    if (!user || !user.isActive) {
      return null;
    }
    const resetToken = signToken({ sub: user.id, purpose: "password-reset", version: user.sessionVersion }, "15m");
    const resetUrl = `${env.CLIENT_URL}/reset-password?token=${resetToken}`;
    const issued = await authRepository.issueResetToken(
      user.id,
      resetToken,
      new Date(Date.now() + 15 * 60 * 1000),
      user.sessionVersion,
    );
    try {
      await sendAuthEmail({ to: user.email, subject: "Reset Your Password — Abbey's Kitchenette",
        html: generateResetPasswordEmail(resetUrl) },
      { userId: user.id, context: "password-reset", requestId: issued.id },
      () => authRepository.discardResetToken(user.id, resetToken));
    } catch {
      return null;
    }
    return user;
  },

  /** Hash outside row locks, then atomically consume the reset token and revoke existing credentials. */
  async resetPassword(token, newPassword) {
    let decoded;
    try {
      decoded = verifyToken(token, "password-reset");
    } catch {
      throw new AppError(401, "Invalid or expired reset token", "INVALID_TOKEN");
    }
    if (decoded.purpose !== "password-reset") {
      throw new AppError(401, "Invalid token purpose", "INVALID_TOKEN");
    }
    if (!Number.isSafeInteger(decoded.version)) throw new AppError(401, "Invalid reset token", "INVALID_TOKEN");
    // Reject replays cheaply; the transaction repeats this check when claiming the token.
    const stored = await authRepository.findResetToken(token);
    if (!stored || stored.usedAt || stored.expiresAt <= new Date()) {
      throw new AppError(401, "Invalid or expired reset token", "INVALID_TOKEN");
    }
    const passwordHash = await bcrypt.hash(newPassword, 10);
    const user = await authRepository.resetPassword(token, decoded.sub, decoded.version, passwordHash);
    revokeLocalSessions(user.id);
    return publicUser(user);
  },

  async updateProfile(userId, name, email, currentPassword, version) {
    const user = await authRepository.findById(userId);
    if (!user?.isActive) throw new AppError(401, "Account is unavailable", "UNAUTHORIZED");
    if (email !== user.email) return emailChange.request(userId, version, name, email, currentPassword);
    try { return { user: await authRepository.updateProfile(userId, { name }, version) }; }
    catch (error) {
      if (error.code === "P2025") throw new AppError(409, "Account changed, please log in again", "ACCOUNT_CHANGED");
      throw error;
    }
  },

  async confirmEmailChange(userId, version, id, code) {
    return emailChange.confirm(userId, version, id, code);
  },

  /** Verify the old hash, then guard the update against concurrent password changes and issue a fresh session. */
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
    const user = await authRepository.updatePassword(userId, newHash, passwordHash);
    revokeLocalSessions(userId);
    return { user: publicUser(user), token: signSessionToken(user) };
  },

  async uploadProfileImage(userId, imageUrl, version) {
    const user = await authRepository.findById(userId);
    if (!user) {
      throw new AppError(401, "User not found", "USER_NOT_FOUND");
    }
    let updated;
    try { updated = await authRepository.updateImageUrl(userId, imageUrl, user.imageUrl ?? null, version); }
    catch (error) {
      if (error?.code === 'P2025') throw new AppError(409, 'Profile image changed. Refresh and retry.', 'IMAGE_CHANGED');
      throw error;
    }
    if (user.imageUrl && user.imageUrl !== imageUrl) {
      void deleteImage(user.imageUrl);
    }
    return updated;
  },
};
