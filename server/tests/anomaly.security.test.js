import { it, expect, vi } from "vitest";
vi.mock("../src/config/prisma.js", () => ({ default: {} }));
import { securityFindings } from "../src/modules/anomalyDetection/securityRules.js";
import { captureAnomalyTrigger } from "../src/modules/anomalyDetection/anomalyTriggers.js";
import { anomalyGuidance } from "../../client/src/features/anomalyDetection/guidance.js";
import { anomalyQuerySchema } from "../src/modules/anomalyDetection/anomalyDetection.validation.js";
const event = (action, id = "event", details = {}) => ({ id, action, details, createdAt: "2026-10-15T04:01:00Z", user: { name: "Fixture staff" } });
const outside = (id, account = "a".repeat(64)) => event("LOGIN_FAILED", id, { reason: "STORE_IP_REQUIRED", account });

it("flags only the existing lockout and exhausted OTP events, with stable distinct keys", () => {
  const rows = securityFindings([event("ACCOUNT_LOCKED", "lock", { attempts: 5 }), event("OTP_ATTEMPTS_EXHAUSTED", "otp"), event("LOGIN_SUCCESS"), event("LOGIN_FAILED")]);
  expect(rows.map(r => r.ruleId)).toEqual(["security_account_lockout", "security_otp_exhausted"]);
  expect(rows.every(r => r.category === "security" && r.severity === "high" && !r.geminiInsight)).toBe(true);
  expect(new Set(rows.map(r => r.securityKey)).size).toBe(2);
  expect(securityFindings([event("ACCOUNT_LOCKED", "lock", { attempts: 5 })])[0].securityKey).toBe(rows[0].securityKey);
});
it("requires five outside-store denials for the same account in a ten-minute window", () => {
  expect(securityFindings(Array.from({ length: 4 }, (_, i) => outside(String(i))))).toEqual([]);
  const rows = securityFindings(Array.from({ length: 5 }, (_, i) => outside(String(i))));
  expect(rows).toHaveLength(1); expect(rows[0].actualValue).toBe(5);
  expect(rows[0].description).toContain("does not establish whether the password was correct");
  expect(securityFindings([outside("1"), outside("2"), outside("3"), outside("4"), outside("5", "b".repeat(64))])).toEqual([]);
  const later = outside("5"); later.createdAt = "2026-10-15T04:12:00Z";
  expect(securityFindings([outside("1"), outside("2"), outside("3"), outside("4"), later])).toEqual([]);
});
it("admits durable security scans without any blocking or session operations", async () => {
  const tx = { automationRun: { create: vi.fn() } };
  await captureAnomalyTrigger(tx, "one", { action: "ACCOUNT_LOCKED" });
  await captureAnomalyTrigger(tx, "two", { action: "OTP_ATTEMPTS_EXHAUSTED" });
  await captureAnomalyTrigger(tx, "three", { action: "LOGIN_FAILED", details: { reason: "STORE_IP_REQUIRED" } });
  await captureAnomalyTrigger(tx, "four", { action: "LOGIN_SUCCESS" });
  expect(tx.automationRun.create.mock.calls.map(([call]) => call.data.result.rules[0])).toEqual([
    "security_account_lockout", "security_otp_exhausted", "security_outside_store"]);
});
it("supports admin security filters and action-specific standard guidance", () => {
  expect(anomalyQuerySchema.parse({ category: "security" }).category).toBe("security");
  expect(anomalyGuidance({ ruleId: "security_outside_store" }).text).toContain("mobile data");
  expect(anomalyGuidance({ ruleId: "security_otp_exhausted" }).text).toContain("never request or share");
});
