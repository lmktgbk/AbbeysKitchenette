import { authAudit } from "../modules/auth/authEffects.js";
import { ACTIONS } from "../modules/auditLogs/auditLog.constants.js";
import crypto from "node:crypto";
import prisma from "../config/prisma.js";
import { env } from "../config/env.js";
import { AppError } from "../middleware/errorHandler.middleware.js";
import { lockAccount } from "../modules/auth/accountLock.js";

const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 60_000;

function hashCode(challengeId, code) {
  // A keyed digest prevents a database-only attacker from enumerating six-digit codes.
  return crypto.createHmac("sha256", env.JWT_SECRET).update(`otp:${challengeId}:${code}`).digest("hex");
}

export async function discardOtp(userId, challengeId, code) {
  // Match the delivered code too, so a delayed send failure cannot erase a newer resend.
  return prisma.otpCode.deleteMany({ where: { userId, challengeId, code: hashCode(challengeId, code) } });
}

async function validAccount(tx, userId, expected) {
  const user = await tx.user.findUnique({ where: { id: userId }, select: {
    isActive: true, sessionVersion: true, role: true, lockedUntil: true,
  } });
  return user?.isActive && !(user.lockedUntil > new Date()) && (!expected ||
    (user.sessionVersion === expected.sessionVersion && user.role === expected.role));
}

export async function generateOtp(userId, challengeId, expiresAt, resend = false, expected) {
  return prisma.$transaction(async (tx) => {
    await lockAccount(tx, userId);
    if (expiresAt <= new Date()) throw new AppError(401, "Login challenge expired", "INVALID_CHALLENGE");
    if (!await validAccount(tx, userId, expected)) {
      throw new AppError(401, "Account changed, please sign in again", "INVALID_CHALLENGE");
    }
    const recent = await tx.otpCode.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } });
    if (resend && (!recent || recent.challengeId !== challengeId || recent.expiresAt <= new Date())) {
      throw new AppError(401, "Login challenge expired, please sign in again", "INVALID_CHALLENGE");
    }
    if (recent && Date.now() - recent.createdAt.getTime() < RESEND_COOLDOWN_MS) {
      throw new AppError(429, "Please wait before requesting a new code", "OTP_RESEND_COOLDOWN");
    }
    const code = crypto.randomInt(100000, 1000000).toString();
    await tx.otpCode.deleteMany({ where: { userId } });
    await tx.otpCode.create({ data: { userId, challengeId, code: hashCode(challengeId, code), expiresAt } });
    await authAudit(tx, userId, ACTIONS.OTP_REQUESTED, { requestId: challengeId, resend, delivery: "not-confirmed" });
    return code;
  });
}

export async function verifyOtp(userId, challengeId, code, expected) {
  const outcome = await prisma.$transaction(async (tx) => {
    await lockAccount(tx, userId);
    if (!await validAccount(tx, userId, expected)) return "challenge";
    const stored = await tx.otpCode.findUnique({ where: { challengeId } });
    if (!stored || stored.userId !== userId) return "invalid";
    if (stored.expiresAt <= new Date() || stored.attempts >= MAX_ATTEMPTS) {
      await tx.otpCode.deleteMany({ where: { id: stored.id } });
      return stored.attempts >= MAX_ATTEMPTS ? "exhausted" : "invalid";
    }
    const supplied = hashCode(challengeId, String(code));
    const storedDigest = Buffer.from(stored.code, "hex");
    const candidate = Buffer.from(supplied, "hex");
    if (storedDigest.length !== candidate.length || !crypto.timingSafeEqual(storedDigest, candidate)) {
      const updated = await tx.otpCode.update({
        where: { id: stored.id }, data: { attempts: { increment: 1 } },
      });
      // Commit the failed-attempt write before returning an authentication error.
      return updated.attempts >= MAX_ATTEMPTS ? "exhausted" : "invalid";
    }
    const consumed = await tx.otpCode.deleteMany({ where: {
      id: stored.id, userId, challengeId, attempts: { lt: MAX_ATTEMPTS }, expiresAt: { gt: new Date() },
    } });
    if (consumed.count !== 1) return "invalid";
    await tx.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
    await authAudit(tx, userId, ACTIONS.OTP_VERIFIED, { requestId: challengeId });
    await authAudit(tx, userId, ACTIONS.LOGIN_SUCCESS, { method: "email-otp" });
    return "verified";
  });
  if (outcome === "challenge") throw new AppError(401, "Account changed, please sign in again", "INVALID_CHALLENGE");
  if (outcome === "exhausted") {
    throw new AppError(429, "Too many wrong attempts — request a new code", "OTP_ATTEMPTS_EXCEEDED");
  }
  if (outcome !== "verified") throw new AppError(401, "Invalid or expired OTP code", "INVALID_OTP");
  return true;
}
