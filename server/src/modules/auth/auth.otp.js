import { authAudit } from "./auth.effects.js";
import { ACTIONS } from "../auditLogs/auditLog.constants.js";
import crypto from "node:crypto";
import prisma from "../../config/prisma.js";
import { env } from "../../config/env.js";
import { AppError } from "../../middleware/errorHandler.middleware.js";
import { lockAccount } from "./auth.accountLock.js";

const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 60_000;

/** Bind a code digest to its login challenge; the login prefix separates it from email-change codes. */
function hashCode(challengeId, code) {
  // A keyed digest prevents a database-only attacker from enumerating six-digit codes.
  return crypto.createHmac("sha256", env.JWT_SECRET).update(`otp:${challengeId}:${code}`).digest("hex");
}

/** Invalidate only the exact undelivered code; a late SMTP failure must not delete a newer resend. */
export async function discardOtp(userId, challengeId, code) {
  // Match the delivered code too, so a delayed send failure cannot erase a newer resend.
  return prisma.otpCode.deleteMany({ where: { userId, challengeId, code: hashCode(challengeId, code) } });
}

/** Recheck locked account state against the role/version captured when password verification succeeded. */
async function validAccount(tx, userId, expected) {
  const user = await tx.user.findUnique({ where: { id: userId }, select: {
    isActive: true, sessionVersion: true, role: true, lockedUntil: true,
  } });
  return user?.isActive && !(user.lockedUntil > new Date()) && (!expected ||
    (user.sessionVersion === expected.sessionVersion && user.role === expected.role));
}

/**
 * Replace the account's login code and save issuance audit intent atomically.
 * A resend keeps the challenge's original expiry and enforces the cooldown.
 * Return the plaintext code only to the mail workflow; storage contains its keyed digest.
 */
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
      const error = new AppError(429, "Please wait before requesting a new code", "OTP_RESEND_COOLDOWN");
      // Measure from persisted issuance; rejected requests do not extend the cooldown.
      error.retryAfterSeconds = Math.max(1, Math.ceil((recent.createdAt.getTime() + RESEND_COOLDOWN_MS - Date.now()) / 1000));
      throw error;
    }
    const code = crypto.randomInt(100000, 1000000).toString();
    await tx.otpCode.deleteMany({ where: { userId } });
    await tx.otpCode.create({ data: { userId, challengeId, code: hashCode(challengeId, code), expiresAt } });
    await authAudit(tx, userId, ACTIONS.OTP_REQUESTED, { requestId: challengeId, resend, delivery: "not-confirmed" });
    return code;
  });
}

/**
 * Consume a login challenge once while holding the account lock.
 * Return failure outcomes from the transaction, then throw after commit so wrong
 * guesses retain their attempt increments. Successful consumption records login audit.
 */
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
    // timingSafeEqual requires equal-length buffers; reject malformed stored digests without throwing.
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
