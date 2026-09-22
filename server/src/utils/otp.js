import crypto from "crypto";
import prisma from "../config/prisma.js";
import { AppError } from "../middleware/errorHandler.middleware.js";

/**
 * OTP Utility (DB-backed)
 *
 * Admin 2FA codes live in otp_codes so they survive restarts and work
 * across instances. One live code per user; verification is attempt-capped
 * (5 strikes burns the code) and resends are cooldown-limited (60s).
 */

const OTP_EXPIRY_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_COOLDOWN_SECONDS = 60;

/**
 * Generate a 6-digit OTP for a user (replaces any live code).
 * @param {string} userId - The user ID
 * @returns {Promise<string>} - The 6-digit OTP code
 * @throws {AppError} 429 when a code was sent within the cooldown window
 */
export async function generateOtp(userId) {
  const recent = await prisma.otpCode.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
  if (recent && Date.now() - new Date(recent.createdAt).getTime() < OTP_RESEND_COOLDOWN_SECONDS * 1000) {
    throw new AppError(429, "Please wait before requesting a new code", "OTP_RESEND_COOLDOWN");
  }

  // Opportunistic janitor: drop expired rows while we're here.
  await prisma.otpCode.deleteMany({
    where: { OR: [{ userId }, { expiresAt: { lt: new Date() } }] },
  });

  const code = crypto.randomInt(100000, 999999).toString();
  await prisma.otpCode.create({
    data: {
      userId,
      code,
      expiresAt: new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000),
    },
  });
  return code;
}

/**
 * Verify an OTP. Burns the code on success, on expiry, and on strike-out.
 * @param {string} userId - The user ID
 * @param {string} code - The 6-digit code to verify
 * @returns {Promise<true>}
 * @throws {AppError} 401 INVALID_OTP | 429 OTP_ATTEMPTS_EXCEEDED
 */
export async function verifyOtp(userId, code) {
  const stored = await prisma.otpCode.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
  if (!stored || stored.expiresAt.getTime() < Date.now()) {
    if (stored) await prisma.otpCode.delete({ where: { id: stored.id } });
    throw new AppError(401, "Invalid or expired OTP code", "INVALID_OTP");
  }
  if (stored.attempts >= OTP_MAX_ATTEMPTS) {
    await prisma.otpCode.delete({ where: { id: stored.id } });
    throw new AppError(429, "Too many wrong attempts — request a new code", "OTP_ATTEMPTS_EXCEEDED");
  }
  if (stored.code !== String(code)) {
    const attempts = stored.attempts + 1;
    if (attempts >= OTP_MAX_ATTEMPTS) {
      await prisma.otpCode.delete({ where: { id: stored.id } });
      throw new AppError(429, "Too many wrong attempts — request a new code", "OTP_ATTEMPTS_EXCEEDED");
    }
    await prisma.otpCode.update({ where: { id: stored.id }, data: { attempts } });
    throw new AppError(401, "Invalid or expired OTP code", "INVALID_OTP");
  }
  await prisma.otpCode.delete({ where: { id: stored.id } });
  return true;
}
