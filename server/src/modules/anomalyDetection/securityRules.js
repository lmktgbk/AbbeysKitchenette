import { createHash } from "node:crypto";
import prisma from "../../config/prisma.js";

export const SECURITY_RULE_IDS = ["security_account_lockout", "security_outside_store", "security_otp_exhausted"];
const WINDOW_MS = 10 * 60 * 1000;

/** Detection only: no credential, session, network-policy or inventory writes. */
export function securityFindings(events) {
  const findings = [], outside = new Map();
  const add = (ruleId, key, title, description, count, detectedAt) => {
    const securityKey = createHash("sha256").update(`${ruleId}:${key}`).digest("hex");
    findings.push({ ruleId, category: "security", severity: "high", title,
      description: `${description} [security:${securityKey}]`, actualValue: count,
      expectedValue: 5, expectedMin: 0, expectedMax: 4,
      confidence: 1, geminiInsight: null, detectedAt: new Date(detectedAt), securityKey });
  };
  for (const event of events) {
    const reference = event.user?.name ? `Account: ${event.user.name}.` : "An account requires review.";
    if (event.action === "ACCOUNT_LOCKED") add(SECURITY_RULE_IDS[0], event.id, "Repeated incorrect passwords",
      `${reference} The existing password lockout was reached after ${Number(event.details?.attempts) || 5} incorrect attempts. No additional restriction was applied.`,
      Number(event.details?.attempts) || 5, event.createdAt);
    if (event.action === "OTP_ATTEMPTS_EXHAUSTED") add(SECURITY_RULE_IDS[2], event.id, "OTP attempts exhausted",
      `${reference} A login challenge reached five incorrect OTP attempts. No additional restriction was applied.`, 5, event.createdAt);
    if (event.action === "LOGIN_FAILED" && event.details?.reason === "STORE_IP_REQUIRED" && /^[a-f0-9]{64}$/.test(event.details?.account ?? "")) {
      const bucket = Math.floor(new Date(event.createdAt).getTime() / WINDOW_MS);
      const key = `${event.details.account}:${bucket}`;
      const group = outside.get(key) ?? { count: 0, event, account: event.details.account };
      group.count++; outside.set(key, group);
    }
  }
  for (const [key, group] of outside) if (group.count >= 5) add(SECURITY_RULE_IDS[1], key, "Repeated outside-store staff login attempts",
    `${group.count} staff login attempts for account reference ${group.account.slice(0, 8)} were denied by the existing store-network policy within one 10-minute window. This does not establish whether the password was correct.`,
    group.count, group.event.createdAt);
  return findings;
}

/** Recover recent delivered audit events; source events are durable and rule IDs isolate triggered scans. */
export async function collectSecurityFindings(ruleIds) {
  if (ruleIds && !ruleIds.some(id => SECURITY_RULE_IDS.includes(id))) return [];
  const events = await prisma.auditLog.findMany({ where: {
    createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    OR: [{ action: { in: ["ACCOUNT_LOCKED", "OTP_ATTEMPTS_EXHAUSTED"] } },
      { action: "LOGIN_FAILED", details: { path: ["reason"], equals: "STORE_IP_REQUIRED" } }],
  }, include: { user: { select: { name: true } } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  return securityFindings(events).filter(row => !ruleIds || ruleIds.includes(row.ruleId));
}
