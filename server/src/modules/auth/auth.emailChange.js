import { authAudit, sendAuthEmail } from "./auth.effects.js";
import { ACTIONS } from "../auditLogs/auditLog.constants.js";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import prisma from "../../config/prisma.js";
import { env } from "../../config/env.js";
import { AppError } from "../../middleware/errorHandler.middleware.js";
import { generateOtpEmail } from "../../utils/email.js";
import { lockAccount, lockSessionAccount } from "./auth.accountLock.js";
import { SESSION_USER_SELECT, publicUser } from "./auth.session.js";
import { signSessionToken } from "../../config/jwt.js";
import { revokeLocalSessions } from "../../realtime/sessions.js";
import { authRepository } from "./auth.repository.js";

const invalid = () => new AppError(400, "Invalid or expired email verification code", "INVALID_EMAIL_CODE");
const changed = () => new AppError(409, "Account changed, request a new verification code", "ACCOUNT_CHANGED");
const digest = (id, code) => crypto.createHmac("sha256", env.JWT_SECRET)
  .update(`email-change:${id}:${code}`).digest("hex");
const ACCOUNT_SELECT = { ...SESSION_USER_SELECT, passwordHash: true, lockedUntil: true };

/** Require the original session and address so reset/logout cannot authorize a stale email-change request. */
function matches(user, pending, version) {
  return user?.isActive && !(user.lockedUntil > new Date()) && user.sessionVersion === version &&
    user.sessionVersion === pending.sessionVersion && user.email === pending.oldEmail;
}

export const emailChange = {
  /** Save a password-confirmed challenge under the account lock, then send notices outside the transaction. */
  async request(userId, version, name, email, password) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: ACCOUNT_SELECT });
    if (!user?.isActive || user.sessionVersion !== version) throw changed();
    if (user.lockedUntil > new Date()) throw new AppError(423, "Account is locked", "ACCOUNT_LOCKED");
    if (!password || !await bcrypt.compare(password, user.passwordHash)) {
      if (password) {
        const state = await authRepository.incrementFailedLoginAttempts(userId, 15);
        if (state.failedLoginAttempts >= 5) throw new AppError(423, "Account is locked", "ACCOUNT_LOCKED");
      }
      throw new AppError(400, "Current password is incorrect", "INVALID_PASSWORD");
    }
    const id = crypto.randomUUID();
    const code = crypto.randomInt(100000, 1000000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60_000);
    await prisma.$transaction(async tx => {
      await lockAccount(tx, userId);
      const current = await tx.user.findUnique({ where: { id: userId }, select: ACCOUNT_SELECT });
      if (!matches(current, { sessionVersion: version, oldEmail: user.email }, version) ||
          current.passwordHash !== user.passwordHash) throw changed();
      const recent = await tx.emailChangeRequest.findUnique({ where: { userId } });
      if (recent && Date.now() - recent.createdAt.getTime() < 60_000) {
        throw new AppError(429, "Wait one minute before requesting another code", "EMAIL_CHANGE_COOLDOWN");
      }
      const taken = await tx.user.findUnique({ where: { email }, select: { id: true } });
      if (taken) throw new AppError(409, "Email is unavailable", "EMAIL_TAKEN");
      await tx.emailChangeRequest.deleteMany({ where: { userId } });
      await tx.emailChangeRequest.create({ data: {
        id, userId, oldEmail: user.email, newEmail: email, name,
        codeHash: digest(id, code), sessionVersion: version, expiresAt,
      } });
      await authAudit(tx, userId, ACTIONS.PROFILE_UPDATED,
        { fields: ["email-change-request"], requestId: id, delivery: "not-confirmed" });
    });
    // SMTP stays outside row locks. A failed send invalidates only its own request.
    try {
      await sendAuthEmail({ to: user.email, subject: "Recovery email change requested",
        html: "<p>A recovery email change was requested for your account. Your current email remains active until verification. If this was not you, change your password and contact your administrator.</p>" },
      { userId, context: "email-change-request-notice", requestId: id });
      await sendAuthEmail({ to: email, subject: "Verify your new recovery email", html: generateOtpEmail(code, "email-change") },
        { userId, context: "email-change-verification", requestId: id },
        () => prisma.emailChangeRequest.deleteMany({ where: { id, userId } }));
    } catch (error) {
      await prisma.emailChangeRequest.deleteMany({ where: { id, userId } });
      throw error;
    }
    return { user: publicUser(user), emailChange: { id, email, expiresAt } };
  },

  /** Verify once, rotate the session version, invalidate old challenges, and issue the current browser a new session. */
  async confirm(userId, version, id, code) {
    let outcome;
    try {
      outcome = await prisma.$transaction(async tx => {
        // All credential flows lock the account first; verification cannot race a reset.
        const user = await lockSessionAccount(tx, userId);
        const pending = await tx.emailChangeRequest.findUnique({ where: { userId } });
        if (!pending || pending.id !== id || pending.expiresAt <= new Date() || pending.attempts >= 5) {
          return { error: invalid() };
        }
        if (!matches(user, pending, version)) return { error: changed() };
        if (!crypto.timingSafeEqual(Buffer.from(pending.codeHash, "hex"), Buffer.from(digest(id, code), "hex"))) {
          // Return the error after commit so failed attempts are never rolled back.
          await tx.emailChangeRequest.update({ where: { userId }, data: { attempts: { increment: 1 } } });
          return { error: invalid() };
        }
        const updated = await tx.user.update({ where: { id: userId }, data: {
          email: pending.newEmail, name: pending.name, sessionVersion: { increment: 1 },
        }, select: SESSION_USER_SELECT });
        await tx.emailChangeRequest.delete({ where: { userId } });
        await tx.otpCode.deleteMany({ where: { userId } });
        await tx.passwordResetToken.deleteMany({ where: { userId, usedAt: null } });
        await authAudit(tx, userId, ACTIONS.PROFILE_UPDATED,
          { fields: ["email"], verified: true, requestId: id, completionNotice: "not-confirmed" });
        return { user: updated, oldEmail: pending.oldEmail };
      });
    } catch (error) {
      if (error.code === "P2002") throw new AppError(409, "Email is unavailable, request another address", "EMAIL_TAKEN");
      if (error.code === "P2028") throw new AppError(503, "Email verification is busy. Check your profile and try again shortly", "EMAIL_VERIFICATION_UNAVAILABLE");
      throw error;
    }
    if (outcome.error) throw outcome.error;
    revokeLocalSessions(userId);
    // A request notice preceded the verification email; completion delivery cannot roll back the change.
    await sendAuthEmail({ to: outcome.oldEmail, subject: "Recovery email changed",
      html: "<p>Your recovery email has been changed and other sessions revoked. Contact your administrator if this was not you.</p>" },
      { userId, context: "email-change-completion", requestId: id })
      .catch(() => console.warn("Recovery email completion notification failed"));
    return { user: publicUser(outcome.user), token: signSessionToken(outcome.user) };
  },
};
