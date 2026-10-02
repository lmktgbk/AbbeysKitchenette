import crypto from "crypto";
import prisma from "../../config/prisma.js";
import { AppError } from "../../middleware/errorHandler.middleware.js";
import { SESSION_USER_SELECT } from "./session.js";
import { lockAccount } from "./accountLock.js";

/**
 * Auth Repository
 *
 * Credential reads remain internal to login/password verification. Public
 * profiles use explicit projections and never include revocation state.
 */
export const authRepository = {
  async findByEmailWithCredentials(email) {
    return prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        passwordHash: true,
        sessionVersion: true,
        imageUrl: true,
        isActive: true,
        failedLoginAttempts: true,
        lockedUntil: true,
        lastLoginAt: true,
      },
    });
  },

  async findByEmail(email) {
    return prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, role: true, isActive: true, sessionVersion: true },
    });
  },

  async findSecurityState(id) {
    return prisma.user.findUnique({
      where: { id }, select: { ...SESSION_USER_SELECT, lockedUntil: true },
    });
  },

  async findById(id) {
    return prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        imageUrl: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });
  },

  async isEmailTaken(email, userId) {
    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    return existing && existing.id !== userId;
  },

  async updateLastLogin(userId) {
    return prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
  },

  async incrementFailedLoginAttempts(userId, lockoutMinutes) {
    return prisma.$transaction(async (tx) => {
      await lockAccount(tx, userId);
      const state = await tx.user.findUnique({ where: { id: userId }, select: { lockedUntil: true } });
      if (state?.lockedUntil && state.lockedUntil <= new Date()) {
        await tx.user.update({ where: { id: userId }, data: { failedLoginAttempts: 0, lockedUntil: null } });
      }
      // The increment locks the account row; the threshold sees its current value.
      const user = await tx.user.update({
        where: { id: userId }, data: { failedLoginAttempts: { increment: 1 } },
      });
      if (user.failedLoginAttempts < 5) return user;
      return tx.user.update({ where: { id: userId }, data: {
        lockedUntil: new Date(Date.now() + lockoutMinutes * 60 * 1000),
      } });
    });
  },

  async resetFailedLoginAttempts(userId) {
    return prisma.user.update({
      where: { id: userId },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });
  },

  async updatePassword(userId, passwordHash, expectedHash) {
    return prisma.$transaction(async (tx) => {
      const changed = await tx.user.updateMany({
        where: { id: userId, passwordHash: expectedHash, isActive: true },
        data: { passwordHash, sessionVersion: { increment: 1 } },
      });
      if (changed.count !== 1) throw new AppError(409, "Account changed, please log in again", "ACCOUNT_CHANGED");
      await tx.otpCode.deleteMany({ where: { userId } });
      await tx.passwordResetToken.deleteMany({ where: { userId, usedAt: null } });
      return tx.user.findUnique({ where: { id: userId }, select: SESSION_USER_SELECT });
    });
  },

  async revokeSessions(userId, expectedVersion) {
    return prisma.$transaction(async (tx) => {
      const revoked = await tx.user.updateMany({
        where: { id: userId, sessionVersion: expectedVersion },
        data: { sessionVersion: { increment: 1 } },
      });
      if (revoked.count === 1) {
        await tx.otpCode.deleteMany({ where: { userId } });
        await tx.passwordResetToken.deleteMany({ where: { userId, usedAt: null } });
      }
      return revoked;
    });
  },

  async updateProfile(userId, data) {
    return prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true, name: true, email: true, role: true, imageUrl: true,
        isActive: true, lastLoginAt: true, createdAt: true,
      },
    });
  },

  async updateImageUrl(userId, imageUrl) {
    return prisma.user.update({
      where: { id: userId },
      data: { imageUrl },
      select: {
        id: true, name: true, email: true, role: true, imageUrl: true,
        isActive: true, lastLoginAt: true, createdAt: true,
      },
    });
  },

  async getPasswordHash(userId) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
    return user?.passwordHash ?? null;
  },

  /* ── Single-use password-reset tokens (sha256 hash, never raw) ── */

  hashResetToken(token) {
    return crypto.createHash("sha256").update(token).digest("hex");
  },

  // Issuance and consumption use the same account lock to serialize recovery changes.
  async issueResetToken(userId, token, expiresAt, expectedVersion) {
    return prisma.$transaction(async (tx) => {
      await lockAccount(tx, userId);
      const user = await tx.user.findUnique({ where: { id: userId }, select: SESSION_USER_SELECT });
      if (!user?.isActive || user.sessionVersion !== expectedVersion) {
        throw new AppError(409, "Account changed, request a new reset link", "ACCOUNT_CHANGED");
      }
      await tx.passwordResetToken.deleteMany({ where: { userId, usedAt: null } });
      return tx.passwordResetToken.create({ data: {
        userId, tokenHash: this.hashResetToken(token), expiresAt,
      } });
    });
  },

  async findResetToken(token) {
    return prisma.passwordResetToken.findUnique({
      where: { tokenHash: this.hashResetToken(token) },
    });
  },

  async resetPassword(token, userId, version, passwordHash) {
    return prisma.$transaction(async (tx) => {
      await lockAccount(tx, userId);
      const now = new Date();
      const claimed = await tx.passwordResetToken.updateMany({
        where: { tokenHash: this.hashResetToken(token), userId, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (claimed.count !== 1) throw new AppError(401, "Invalid or expired reset token", "INVALID_TOKEN");
      const changed = await tx.user.updateMany({
        where: { id: userId, isActive: true, sessionVersion: version },
        data: { passwordHash, sessionVersion: { increment: 1 }, failedLoginAttempts: 0, lockedUntil: null },
      });
      if (changed.count !== 1) throw new AppError(401, "Invalid or expired reset token", "INVALID_TOKEN");
      await tx.otpCode.deleteMany({ where: { userId } });
      await tx.passwordResetToken.deleteMany({ where: { userId, usedAt: null } });
      return tx.user.findUnique({ where: { id: userId }, select: SESSION_USER_SELECT });
    });
  },
};
