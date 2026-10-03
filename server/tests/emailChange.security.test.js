import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { createAuthDatabase } from "./helpers/authDatabase.js";

const h = vi.hoisted(() => ({ db: null, mail: [], failRecipient: null, revoked: [] }));
vi.mock("../src/config/prisma.js", () => ({ default: new Proxy({}, { get: (_, key) => h.db[key] }) }));
vi.mock("../src/config/env.js", () => ({ env: {
  NODE_ENV: "test", JWT_SECRET: "test-email-change-secret-at-least-32-characters", JWT_EXPIRES_IN: "8h",
} }));
vi.mock("../src/utils/email.js", () => ({ generateOtpEmail: code => code, generateResetPasswordEmail: x => x,
  sendEmail: async message => { if (message.to === h.failRecipient) throw new Error("SMTP unavailable"); h.mail.push(message); },
}));
vi.mock("../src/realtime/sessions.js", () => ({ revokeLocalSessions: id => h.revoked.push(id) }));
vi.mock("../src/utils/ipCheck.js", () => ({ isStoreIP: async () => true }));
vi.mock("../src/utils/cloudinary.js", () => ({ deleteImage: vi.fn() }));
vi.mock("../src/middleware/upload.middleware.js", () => ({ uploadAvatar: (_, __, next) => next() }));
vi.mock("../src/modules/auditLogs/auditLog.service.js", () => ({ auditLogService: { logAction: vi.fn().mockResolvedValue({}) } }));
import authRoutes from "../src/modules/auth/auth.routes.js";
import { emailChange } from "../src/modules/auth/emailChange.js";
import { staffService } from "../src/modules/staff/staff.service.js";
import { authLimiter, emailChangeLimiter } from "../src/middleware/rateLimitin.middleware.js";
import { signSessionToken, verifySessionToken } from "../src/config/jwt.js";
import errorHandler from "../src/middleware/errorHandler.middleware.js";

const id = "123e4567-e89b-42d3-a456-426614174000";
const password = "test-password";
let user, server, base;
beforeAll(async () => {
  user = { id, name: "Original", email: "old@example.invalid", role: "admin", isActive: true,
    sessionVersion: 0, failedLoginAttempts: 0, lockedUntil: null, passwordHash: await bcrypt.hash(password, 4) };
  h.db = createAuthDatabase();
  const app = express(); app.use(express.json(), cookieParser()); app.use("/auth", authRoutes); app.use(errorHandler);
  server = await new Promise(resolve => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
  base = `http://127.0.0.1:${server.address().port}/auth`;
});
beforeEach(() => { h.db.reset(user); h.mail = []; h.failRecipient = null; h.revoked = []; authLimiter.resetKey("127.0.0.1"); emailChangeLimiter.resetKey(`email-change:${id}`); });
afterAll(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
const start = () => emailChange.request(id, 0, "Updated", "new@example.invalid", password);
const code = () => h.mail.find(x => x.to === "new@example.invalid").html;
async function request(path, method, body, token = signSessionToken(user)) {
  const response = await fetch(base + path, { method, headers: { "Content-Type": "application/json", Cookie: token ? `token=${token}` : "" }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json(), cookies: response.headers.getSetCookie() };
}

describe("Recovery email changes", () => {
  it("rejects a stolen session without the current password and never changes email", async () => {
    const r = await request("/me", "PATCH", { name: "Updated", email: "new@example.invalid" });
    expect(r.status).toBe(400); expect(h.db.state.user[0].email).toBe(user.email); expect(h.mail).toEqual([]);
  });
  it("allows name-only changes without password or challenge", async () => {
    const r = await request("/me", "PATCH", { name: "Updated", email: user.email, currentPassword: "" });
    expect(r.status).toBe(200); expect(r.body.data.user.name).toBe("Updated"); expect(h.mail).toEqual([]);
  });
  it.each(["cashier", "kitchen"])("allows verified self-service for the %s role", async role => {
    h.db.state.user[0].role = role;
    const token = signSessionToken({ ...user, role });
    const r = await request("/me", "PATCH", { name: "Updated", email: "new@example.invalid", currentPassword: password }, token);
    expect(r.status).toBe(200);
    const confirmed = await request("/verify-email-change", "POST", { id: r.body.data.emailChange.id, code: code() }, token);
    expect(confirmed.status).toBe(200); expect(confirmed.body.data.user.role).toBe(role);
  });
  it("issues a separate keyed code, keeps old identity, and notifies the old mailbox first", async () => {
    const r = await start();
    expect(h.db.state.user[0]).toEqual(user); expect(h.db.state.emailChangeRequest[0].codeHash).not.toContain(code());
    expect(h.mail.map(x => x.to)).toEqual([user.email, "new@example.invalid"]);
    expect(r.user.passwordHash).toBeUndefined(); expect(r.user.sessionVersion).toBeUndefined();
    expect(h.db.state.otpCode).toEqual([]);
  });
  it("commits identity and revocation together, returns only a cookie session, and rejects replay", async () => {
    const r = await request("/me", "PATCH", { name: "Updated", email: "new@example.invalid", currentPassword: password });
    h.db.state.otpCode.push({ userId: id }); h.db.state.passwordResetToken.push({ userId: id, usedAt: null });
    const confirmed = await request("/verify-email-change", "POST", { id: r.body.data.emailChange.id, code: code() });
    expect(confirmed.status).toBe(200); expect(confirmed.body.data.user.email).toBe("new@example.invalid");
    expect(confirmed.body.data.token).toBeUndefined();
    const token = confirmed.cookies.find(x => x.startsWith("token=")).split(";")[0].slice(6);
    expect(verifySessionToken(token).version).toBe(1);
    expect(h.db.state.otpCode).toEqual([]); expect(h.db.state.passwordResetToken).toEqual([]);
    expect(h.revoked).toEqual([id]); expect(h.db.state.emailChangeRequest).toEqual([]);
    expect((await request("/verify-email-change", "POST", { id: r.body.data.emailChange.id, code: code() })).status).toBe(401);
  });
  it("commits each wrong attempt and disables verification after five guesses", async () => {
    const r = await start(); const wrong = code() === "000000" ? "000001" : "000000";
    for (let n = 1; n <= 5; n++) {
      await expect(emailChange.confirm(id, 0, r.emailChange.id, wrong)).rejects.toMatchObject({ code: "INVALID_EMAIL_CODE" });
      expect(h.db.state.emailChangeRequest[0].attempts).toBe(n);
    }
    await expect(emailChange.confirm(id, 0, r.emailChange.id, code())).rejects.toMatchObject({ code: "INVALID_EMAIL_CODE" });
    expect(h.db.state.user[0].email).toBe(user.email);
  });
  it.each(["expiry", "version", "email", "disabled", "locked"])("rejects %s state changes", async kind => {
    const r = await start();
    if (kind === "expiry") h.db.state.emailChangeRequest[0].expiresAt = new Date(0);
    if (kind === "version") h.db.state.user[0].sessionVersion++;
    if (kind === "email") h.db.state.user[0].email = "other@example.invalid";
    if (kind === "disabled") h.db.state.user[0].isActive = false;
    if (kind === "locked") h.db.state.user[0].lockedUntil = new Date(Date.now() + 60_000);
    await expect(emailChange.confirm(id, 0, r.emailChange.id, code())).rejects.toBeInstanceOf(Error);
    expect(h.db.state.user[0].email).not.toBe("new@example.invalid"); expect(h.revoked).toEqual([]);
  });
  it.each(["old@example.invalid", "new@example.invalid"])("invalidates a request when delivery to %s fails", async recipient => {
    h.failRecipient = recipient; await expect(start()).rejects.toThrow("SMTP unavailable");
    expect(h.db.state.emailChangeRequest).toEqual([]); expect(h.db.state.user[0]).toEqual(user);
  });
  it("enforces cooldown and replaces expired requests without accepting their old codes", async () => {
    const r = await start(); const old = code();
    await expect(start()).rejects.toMatchObject({ code: "EMAIL_CHANGE_COOLDOWN" });
    h.db.state.emailChangeRequest[0].createdAt = new Date(0);
    const next = await start();
    await expect(emailChange.confirm(id, 0, r.emailChange.id, old)).rejects.toMatchObject({ code: "INVALID_EMAIL_CODE" });
    expect(h.db.state.emailChangeRequest[0].id).toBe(next.emailChange.id);
  });
  it("allows only one concurrent confirmation", async () => {
    const r = await start();
    const outcomes = await Promise.allSettled([emailChange.confirm(id, 0, r.emailChange.id, code()), emailChange.confirm(id, 0, r.emailChange.id, code())]);
    expect(outcomes.filter(x => x.status === "fulfilled")).toHaveLength(1); expect(h.db.state.user[0].sessionVersion).toBe(1);
  });
  it("rolls back identity if credential cleanup fails", async () => {
    const r = await start();
    const spy = vi.spyOn(h.db.otpCode, "deleteMany").mockRejectedValueOnce(new Error("Cleanup failed"));
    await expect(emailChange.confirm(id, 0, r.emailChange.id, code())).rejects.toThrow("Cleanup failed");
    expect(h.db.state.user[0]).toEqual(user); expect(h.db.state.emailChangeRequest).toHaveLength(1); spy.mockRestore();
  });
  it("rejects occupied addresses before sending email", async () => {
    h.db.state.user.push({ ...user, id: crypto.randomUUID(), email: "new@example.invalid" });
    await expect(start()).rejects.toMatchObject({ code: "EMAIL_TAKEN" }); expect(h.mail).toEqual([]);
  });
  it("blocks the admin staff-edit shortcut for changing one's own recovery address", async () => {
    await expect(staffService.updateStaff(id, { email: "new@example.invalid" }, id))
      .rejects.toMatchObject({ code: "EMAIL_VERIFICATION_REQUIRED" });
    expect(h.db.state.user[0].email).toBe(user.email);
  });
  it("uses the account lockout budget for wrong current passwords", async () => {
    for (let n = 1; n <= 4; n++) {
      await expect(emailChange.request(id, 0, "Updated", "new@example.invalid", "wrong"))
        .rejects.toMatchObject({ code: "INVALID_PASSWORD" });
    }
    await expect(emailChange.request(id, 0, "Updated", "new@example.invalid", "wrong"))
      .rejects.toMatchObject({ code: "ACCOUNT_LOCKED" });
    await expect(start()).rejects.toMatchObject({ code: "ACCOUNT_LOCKED" });
    expect(h.db.state.emailChangeRequest).toEqual([]);
  });
  it("rechecks account changes after password verification", async () => {
    const spy = vi.spyOn(bcrypt, "compare").mockImplementationOnce(async () => {
      h.db.state.user[0].sessionVersion++; return true;
    });
    await expect(start()).rejects.toMatchObject({ code: "ACCOUNT_CHANGED" });
    expect(h.db.state.emailChangeRequest).toEqual([]); expect(h.mail).toEqual([]); spy.mockRestore();
  });
  it("preserves a committed change when the final notification fails", async () => {
    const r = await start(); h.failRecipient = user.email;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await emailChange.confirm(id, 0, r.emailChange.id, code());
    expect(result.user.email).toBe("new@example.invalid");
    expect(warn).toHaveBeenCalledWith("Recovery email completion notification failed"); warn.mockRestore();
  });
  it("rejects unauthenticated, malformed and cross-account confirmations", async () => {
    expect((await request("/verify-email-change", "POST", { id, code: "123456" }, "")).status).toBe(401);
    expect((await request("/verify-email-change", "POST", { id: "bad", code: "abc" })).status).toBe(400);
    const r = await start();
    await expect(emailChange.confirm(crypto.randomUUID(), 0, r.emailChange.id, code())).rejects.toBeInstanceOf(Error);
  });
});
