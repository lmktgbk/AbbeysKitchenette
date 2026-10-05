import crypto from "node:crypto";
import prisma from "../../config/prisma.js";
import { env } from "../../config/env.js";
import { recordEffects } from "../../infrastructure/effects/effects.js";
import { ACTIONS } from "../auditLogs/auditLog.constants.js";
import { sendEmail } from "../../infrastructure/integrations/email.js";

/** Record credential audit intent using the caller's transaction; subject and actor may differ. */
export function authAudit(tx, userId, action, details = {}, subjectId = userId) {
  return recordEffects(tx, { audit: { userId, action, targetType: "staff", targetId: subjectId, details } });
}

/** Capture denied attempts independently; audit failure must never turn a denied login into success. */
export async function recordLoginFailure(email, reason) {
  // Correlate failed attempts without retaining attacker-supplied addresses in audit payloads.
  const account = crypto.createHmac("sha256", env.JWT_SECRET).update(String(email ?? "").trim().toLowerCase()).digest("hex");
  try {
    await prisma.$transaction(tx => authAudit(tx, undefined, ACTIONS.LOGIN_FAILED, { account, reason }), { timeout: 5000 });
  } catch {
    // Authentication remains denied even when its independent failure audit is unavailable.
    console.warn("[auth] Failed-login audit capture unavailable");
  }
}

/** Send outside the credential transaction, invalidate failed challenges, and record the provider outcome. */
export async function sendAuthEmail(message, { userId, context, requestId, subjectId }, invalidate = async () => {}) {
  let failure;
  try { await sendEmail(message); }
  catch (error) {
    failure = error instanceof Error ? error : new Error("Email outcome unconfirmed");
    try { await invalidate(); }
    catch { console.warn("[auth] Undelivered challenge cleanup deferred to expiry"); }
  }
  try {
    // SMTP acceptance is not inbox delivery. A crash leaves the persisted issuance unresolved.
    await prisma.$transaction(tx => authAudit(tx, userId, ACTIONS.AUTH_EMAIL_DELIVERY,
      { context, requestId, outcome: failure ? "unconfirmed" : "provider-accepted" }, subjectId ?? userId), { timeout: 5000 });
  } catch {
    console.warn("[auth] Email outcome capture unavailable; issuance remains recorded");
  }
  if (failure) throw failure;
}
