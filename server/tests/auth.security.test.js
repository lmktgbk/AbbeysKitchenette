import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { EventEmitter } from "node:events";
import WebSocket from "ws";
import { createAuthDatabase } from "./helpers/authDatabase.js";

const h = vi.hoisted(() => ({ db: null, storeAllowed: true, messages: [], mailFailure: false }));
vi.mock("../src/config/prisma.js", () => ({ default: new Proxy({}, { get: (_, key) => h.db[key] }) }));
vi.mock("../src/config/env.js", () => ({ env: {
  NODE_ENV: "test", CLIENT_URL: "http://127.0.0.1", JWT_SECRET: "test-only-authentication-secret-at-least-32-characters",
  JWT_EXPIRES_IN: "8h", WS_HEARTBEAT_MS: 80,
} }));
vi.mock("../src/utils/ipCheck.js", () => ({ isStoreIP: async () => h.storeAllowed }));
vi.mock("../src/infrastructure/storage/imageCleanup.js", () => ({ deleteImage: vi.fn() }));
vi.mock("../src/infrastructure/integrations/email.js", () => ({
  sendEmail: async message => {
    if (h.mailFailure) throw new Error("Injected mail failure");
    h.messages.push(message);
  },
  generateOtpEmail: code => code,
  generateResetPasswordEmail: url => url,
}));
vi.mock("../src/modules/auditLogs/auditLog.service.js", () => ({ auditLogService: { logAction: async () => {} } }));
vi.mock("../src/middleware/upload.middleware.js", () => ({ uploadAvatar: (_, __, next) => next() }));

import authRoutes from "../src/modules/auth/auth.routes.js";
import { authService } from "../src/modules/auth/auth.service.js";
import { authRepository } from "../src/modules/auth/auth.repository.js";
import { signToken, signSessionToken, verifySessionToken, verifyToken } from "../src/config/jwt.js";
import { resolveSession } from "../src/modules/auth/auth.session.js";
import { resolveUser } from "../src/infrastructure/realtime/auth.js";
import { registerSessionSocket } from "../src/infrastructure/realtime/sessions.js";
import { subscribe, topicStats, __reset } from "../src/infrastructure/realtime/hub.js";
import { generateOtp, verifyOtp } from "../src/modules/auth/auth.otp.js";
import errorHandler from "../src/middleware/errorHandler.middleware.js";
import { authLimiter, accountLimiter } from "../src/middleware/rateLimit.middleware.js";
import { staffRepository } from "../src/modules/staff/staff.repository.js";
import { attachRealtimeServer } from "../src/infrastructure/realtime/server.js";

const ID = "123e4567-e89b-42d3-a456-426614174000";
const PASSWORD = "Audit-passphrase-only!";
let user, server, base, realtime;
beforeAll(async () => {
  user = { id: ID, email: "audit@example.invalid", name: "Audit", role: "admin", isActive: true,
    sessionVersion: 0, failedLoginAttempts: 0, lockedUntil: null, passwordHash: await bcrypt.hash(PASSWORD, 4) };
  h.db = createAuthDatabase();
  const app = express();
  app.use(express.json(), cookieParser());
  app.use("/api/auth", authRoutes);
  app.use(errorHandler);
  server = await new Promise(resolve => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
  base = `http://127.0.0.1:${server.address().port}/api/auth`;
  realtime = attachRealtimeServer(server);
});
beforeEach(() => {
  h.db.reset(user); h.messages = []; h.storeAllowed = true; h.mailFailure = false; __reset();
  authLimiter.resetKey("127.0.0.1");
  accountLimiter.resetKey(`account:${user.email}`);
});
afterAll(async () => {
  realtime.stop();
  for (const socket of realtime.wss.clients) socket.terminate();
  await new Promise(resolve => realtime.wss.close(resolve));
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
});

async function request(route, body, cookie = "") {
  const response = await fetch(base + route, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: await response.json(), cookies: response.headers.getSetCookie() };
}
function cookieFrom(result, name) {
  return result.cookies.find(cookie => cookie.startsWith(name + "="))?.split(";")[0];
}
async function login(role = "admin") {
  h.db.state.user[0].role = role;
  const start = await request(role === "admin" ? "/admin-login" : "/login", { email: user.email, password: PASSWORD });
  expect(start.status).toBe(200);
  const challenge = cookieFrom(start, "login_challenge");
  const code = h.messages.at(-1).html;
  return { start, challenge, code };
}
async function loggedIn(role = "admin") {
  const step = await login(role);
  const done = await request("/verify-otp", { userId: ID, code: step.code }, step.challenge);
  expect(done.status).toBe(200);
  return { ...step, done, session: cookieFrom(done, "token") };
}

async function openSocket(token) {
  const socket = new WebSocket(base.replace("http://", "ws://").replace("/api/auth", "/ws"), {
    headers: { Cookie: `token=${token}` },
  });
  await new Promise((resolve, reject) => {
    socket.once("error", reject);
    socket.once("message", raw => {
      const message = JSON.parse(String(raw));
      if (message.type === "ready") resolve();
      else { socket.terminate(); reject(new Error("Expected authenticated WebSocket")); }
    });
  });
  return socket;
}

describe("authentication data flow with actual routes/controllers/services", () => {
  for (const role of ["admin", "cashier", "kitchen"]) {
    it(`${role}: password → HttpOnly challenge → OTP → cookie session → /me`, async () => {
      const flow = await loggedIn(role);
      expect(flow.start.cookies[0]).toContain("HttpOnly");
      expect(flow.start.cookies[0]).toContain("SameSite=Strict");
      expect(flow.start.body.data).not.toHaveProperty("challenge");
      expect(flow.start.body.data.user).not.toHaveProperty("passwordHash");
      expect(flow.done.body.data).not.toHaveProperty("token");
      expect(flow.done.body.data.user).not.toHaveProperty("sessionVersion");
      expect(flow.done.cookies.some(c => c.startsWith("login_challenge=;") && c.includes("Expires="))).toBe(true);
      const me = await request("/me", undefined, flow.session);
      expect(me.status).toBe(200);
      expect(me.body.data.user).toMatchObject({ id: ID, role });
      expect(await resolveUser(flow.session.slice(6))).toMatchObject({ id: ID, role });
    });
  }
  it("rejects reset/challenge/legacy/missing-version tokens in REST and WS", async () => {
    const tokens = [
      signToken({ sub: ID, purpose: "password-reset", version: 0 }, "15m"),
      signToken({ sub: ID, purpose: "login-challenge", version: 0 }, "10m"),
      signToken({ sub: ID, role: "admin" }), "invalid-token",
    ];
    for (const token of tokens) {
      expect((await request("/me", undefined, `token=${token}`)).status).toBe(401);
      await expect(resolveUser(token)).rejects.toMatchObject({ status: 401 });
    }
  });
  it("rejects expired sessions, wrong audiences and tampered tokens", async () => {
    const expired = signToken({ sub: ID, role: "admin", version: 0 }, "-1s");
    await expect(resolveSession(expired)).rejects.toMatchObject({ code: "TOKEN_EXPIRED" });
    const token = signSessionToken(user);
    expect(() => verifyToken(token, "password-reset")).toThrow();
    expect(() => verifySessionToken(token + "x")).toThrow();
  });
  it("requires a successful password step and rejects a different user UUID", async () => {
    expect((await request("/verify-otp", { userId: ID, code: "123456" })).status).toBe(401);
    expect((await request("/resend-otp", { userId: ID })).status).toBe(401);
    expect(h.db.state.otpCode).toHaveLength(0);
    const flow = await login();
    expect((await request("/verify-otp", { userId: crypto.randomUUID(), code: flow.code }, flow.challenge)).status).toBe(401);
    expect(h.db.state.otpCode).toHaveLength(1);
  });
  it("rejects deactivation, role changes and staff location changes after password login", async () => {
    const flow = await login("cashier");
    h.storeAllowed = false;
    expect((await request("/verify-otp", { userId: ID, code: flow.code }, flow.challenge)).status).toBe(403);
    h.storeAllowed = true;
    h.db.state.user[0].isActive = false;
    expect((await request("/verify-otp", { userId: ID, code: flow.code }, flow.challenge)).status).toBe(401);
    h.db.state.user[0].isActive = true;
    h.db.state.user[0].role = "kitchen";
    expect((await request("/resend-otp", { userId: ID }, flow.challenge)).status).toBe(401);
  });
  it("resends only a live challenge, preserves its expiration, and cannot reuse it after login", async () => {
    const flow = await login();
    const expiresAt = h.db.state.otpCode[0].expiresAt;
    expect(h.db.state.otpCode[0].code).toMatch(/^[0-9a-f]{64}$/);
    expect(h.db.state.otpCode[0].code).not.toBe(flow.code);
    expect((await request("/resend-otp", { userId: ID }, flow.challenge)).status).toBe(429);
    h.db.state.otpCode[0].createdAt = new Date(Date.now() - 61_000);
    expect((await request("/resend-otp", { userId: ID }, flow.challenge)).status).toBe(200);
    expect(h.db.state.otpCode[0].expiresAt).toEqual(expiresAt);
    const code = h.messages.at(-1).html;
    expect((await request("/verify-otp", { userId: ID, code }, flow.challenge)).status).toBe(200);
    expect((await request("/resend-otp", { userId: ID }, flow.challenge)).status).toBe(401);
    expect((await request("/verify-otp", { userId: ID, code }, flow.challenge)).status).toBe(401);
  });
  it("commits failed OTP attempts and limits parallel verification to one successful consumption", async () => {
    const flow = await login();
    const id = h.db.state.otpCode[0].challengeId;
    const incorrect = flow.code === "000000" ? "111111" : "000000";
    for (let attempt = 1; attempt <= 5; attempt++) {
      await expect(verifyOtp(ID, id, incorrect)).rejects.toMatchObject({ statusCode: attempt < 5 ? 401 : 429 });
    }
    expect(h.db.state.otpCode[0].attempts).toBe(5);
    await expect(verifyOtp(ID, id, flow.code)).rejects.toMatchObject({ statusCode: 429 });
    h.db.state.otpCode = [];
    const challengeId = crypto.randomUUID();
    const code = await generateOtp(ID, challengeId, new Date(Date.now() + 60_000));
    const results = await Promise.allSettled([verifyOtp(ID, challengeId, code), verifyOtp(ID, challengeId, code)]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
  });
  it("logout invalidates existing tokens, challenges and local socket subscriptions", async () => {
    const flow = await loggedIn();
    const socket = Object.assign(new EventEmitter(), { readyState: 1, __topics: new Set(), __user: user,
      close: vi.fn(() => socket.emit("close")), terminate: vi.fn() });
    registerSessionSocket(socket, ID); subscribe(socket, "orders");
    expect((await request("/logout", {}, flow.session)).status).toBe(200);
    expect(h.db.state.user[0].sessionVersion).toBe(1);
    expect((await request("/me", undefined, flow.session)).status).toBe(401);
    await expect(resolveUser(flow.session.slice(6))).rejects.toMatchObject({ status: 401 });
    expect(socket.close).toHaveBeenCalledWith(4401, "session invalidated");
    expect(topicStats()).toEqual({});
  });
  it("password change rotates the current cookie and invalidates other sessions", async () => {
    const flow = await loggedIn();
    const changed = await request("/change-password", { currentPassword: PASSWORD, newPassword: "New-audit-passphrase!" }, flow.session);
    expect(changed.status).toBe(200);
    expect(changed.body.data).not.toHaveProperty("token");
    expect((await request("/me", undefined, cookieFrom(changed, "token"))).status).toBe(200);
    expect((await request("/me", undefined, flow.session)).status).toBe(401);
    expect(await bcrypt.compare("New-audit-passphrase!", h.db.state.user[0].passwordHash)).toBe(true);
  });
  it("reset is single-use, revokes sessions and allows the new password login", async () => {
    const flow = await loggedIn();
    await request("/forgot-password", { email: user.email });
    const token = new URL(h.messages.at(-1).html).searchParams.get("token");
    const password = "Reset-audit-passphrase!";
    const results = await Promise.all([request("/reset-password", { token, newPassword: password }), request("/reset-password", { token, newPassword: "Other-audit-password!" })]);
    expect(results.map(r => r.status).sort()).toEqual([200, 401]);
    expect(h.db.state.user[0].sessionVersion).toBe(1);
    expect((await request("/me", undefined, flow.session)).status).toBe(401);
    expect((await request("/admin-login", { email: user.email, password })).status).toBe(200);
  });
  it("rolls back reset consumption when password persistence fails", async () => {
    await authService.forgotPassword(user.email);
    const token = new URL(h.messages.at(-1).html).searchParams.get("token");
    h.db.failPasswordWrite = true;
    await expect(authService.resetPassword(token, "Reset-audit-passphrase!")).rejects.toThrow("Injected password write failure");
    expect(h.db.state.passwordResetToken[0].usedAt).toBeNull();
    expect(h.db.state.user[0].sessionVersion).toBe(0);
    expect(h.db.state.user[0].passwordHash).toBe(user.passwordHash);
    h.db.failPasswordWrite = false;
    await expect(authService.resetPassword(token, "Reset-audit-passphrase!")).resolves.toMatchObject({ id: ID });
  });
  it("serializes login counters and resets are unique even in the same second", async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => authRepository.incrementFailedLoginAttempts(ID, 15)));
    expect(results.map(r => r.failedLoginAttempts)).toEqual([1, 2, 3, 4, 5]);
    expect(h.db.state.user[0].lockedUntil).toBeInstanceOf(Date);
    const a = signToken({ sub: ID, purpose: "password-reset", version: 0 }, "15m");
    const b = signToken({ sub: ID, purpose: "password-reset", version: 0 }, "15m");
    expect(a).not.toBe(b);
  });
  it("deactivation/reactivation and staff edits cannot resurrect old sessions", async () => {
    const flow = await loggedIn("cashier");
    await staffRepository.setActive(ID, false);
    await staffRepository.setActive(ID, true);
    expect((await request("/me", undefined, flow.session)).status).toBe(401);
    const session = signSessionToken(h.db.state.user[0]);
    await staffRepository.update(ID, { role: "kitchen" });
    await expect(resolveSession(session)).rejects.toMatchObject({ statusCode: 401 });
  });
  it("rejects expired login challenges and expired OTP rows", async () => {
    const flow = await login();
    const original = verifyToken(flow.challenge.split("=")[1], "login-challenge");
    const expired = signToken({ sub: ID, role: "admin", version: 0, purpose: "login-challenge", challengeId: original.challengeId }, "-1s");
    await expect(authService.verifyOtp(ID, flow.code, expired)).rejects.toMatchObject({ code: "INVALID_CHALLENGE" });
    h.db.state.otpCode[0].expiresAt = new Date(Date.now() - 1);
    expect((await request("/verify-otp", { userId: ID, code: flow.code }, flow.challenge)).status).toBe(401);
  });
  it("closes an actual authenticated WebSocket immediately on local logout", async () => {
    const token = signSessionToken(user);
    const socket = await openSocket(token);
    const closed = new Promise(resolve => socket.once("close", code => resolve(code)));
    await authService.logout(ID, 0);
    expect(await closed).toBe(4401);
  });
  it("revalidates idle sockets after a revocation from another API instance", async () => {
    const socket = await openSocket(signSessionToken(user));
    const closed = new Promise(resolve => socket.once("close", code => resolve(code)));
    h.db.state.user[0].sessionVersion += 1;
    expect(await closed).toBe(4401);
  });
  it("expires an idle connected session even without further messages", async () => {
    const socket = await openSocket(signToken({ sub: ID, role: "admin", version: 0 }, "2s"));
    expect(await new Promise(resolve => socket.once("close", code => resolve(code)))).toBe(4401);
  });
  it("removes undelivered OTPs and allows retry after email failure", async () => {
    h.mailFailure = true;
    await expect(authService.adminLogin(user.email, PASSWORD)).rejects.toThrow("Injected mail failure");
    expect(h.db.state.otpCode).toHaveLength(0);
    h.mailFailure = false;
    expect((await request("/admin-login", { email: user.email, password: PASSWORD })).status).toBe(200);
  });
  it("rechecks revocation under the OTP account lock before consuming a code", async () => {
    const flow = await login();
    h.db.state.user[0].sessionVersion += 1;
    await expect(verifyOtp(ID, h.db.state.otpCode[0].challengeId, flow.code, user)).rejects.toMatchObject({ code: "INVALID_CHALLENGE" });
    expect(h.db.state.otpCode).toHaveLength(1);
  });
  it("restarts expired lockout accounting without losing new parallel strikes", async () => {
    h.db.state.user[0].lockedUntil = new Date(Date.now() - 1);
    h.db.state.user[0].failedLoginAttempts = 5;
    const results = await Promise.all([authRepository.incrementFailedLoginAttempts(ID, 15), authRepository.incrementFailedLoginAttempts(ID, 15)]);
    expect(results.map(r => r.failedLoginAttempts)).toEqual([1, 2]);
  });
  it("fails closed with a safe retryable response when session lookup is unavailable", async () => {
    const lookup = vi.spyOn(h.db.user, "findUnique").mockRejectedValue(new Error("private database connection details"));
    try {
      const token = signSessionToken(user);
      const response = await request("/me", undefined, `token=${token}`);
      expect(response.status).toBe(503);
      expect(response.body.error).toBe("AUTH_UNAVAILABLE");
      expect(JSON.stringify(response.body)).not.toContain("private database");
      await expect(resolveUser(token)).rejects.toMatchObject({ status: 503, message: "Authentication service unavailable" });
    } finally { lookup.mockRestore(); }
  });
});


describe("Authentication durable audit capture", () => {
  it("OTP audit failure rolls consumption and last-login back, then permits retry", async () => {
    const challengeId = crypto.randomUUID();
    const code = await generateOtp(ID, challengeId, new Date(Date.now() + 60000), false, user);
    h.db.failEffect = true;
    await expect(verifyOtp(ID, challengeId, code, user)).rejects.toThrow("Injected audit capture failure");
    expect(h.db.state.otpCode).toHaveLength(1); expect(h.db.state.user[0].lastLoginAt).toBeUndefined();
    h.db.failEffect = false; await verifyOtp(ID, challengeId, code, user);
    expect(h.db.state.otpCode).toHaveLength(0);
    expect(h.db.state.domainEffect.filter(e => e.payload.audit.action === "LOGIN_SUCCESS")).toHaveLength(1);
    expect(h.db.state.domainEffect.filter(e => e.payload.audit.action === "OTP_VERIFIED")).toHaveLength(1);
  });
  it("password change audit failure preserves credentials and session version", async () => {
    h.db.failEffect = true;
    await expect(authService.changePassword(ID, PASSWORD, "Replacement-passphrase!")).rejects.toThrow("Injected audit capture failure");
    expect(h.db.state.user[0].passwordHash).toBe(user.passwordHash); expect(h.db.state.user[0].sessionVersion).toBe(0);
  });
  it("logout audit failure preserves the existing session", async () => {
    h.db.failEffect = true;
    await expect(authService.logout(ID, 0)).rejects.toThrow("Injected audit capture failure");
    expect(h.db.state.user[0].sessionVersion).toBe(0);
    h.db.failEffect = false; await authService.logout(ID, 0); await authService.logout(ID, 0);
    expect(h.db.state.domainEffect.filter(e => e.payload.audit.action === "LOGOUT")).toHaveLength(1);
  });
  it("reset issuance audit failure cannot leave a usable recovery token", async () => {
    h.db.failEffect = true;
    await expect(authService.forgotPassword(user.email)).rejects.toThrow("Injected audit capture failure");
    expect(h.db.state.passwordResetToken).toHaveLength(0); expect(h.messages).toHaveLength(0);
  });
  it("failed recovery delivery returns the generic response and invalidates its token", async () => {
    h.mailFailure = true;
    const known = await request("/forgot-password", { email: user.email });
    const unknown = await request("/forgot-password", { email: "missing@example.invalid" });
    expect(known.status).toBe(200); expect(unknown.status).toBe(200); expect(known.body).toEqual(unknown.body);
    expect(h.db.state.passwordResetToken).toHaveLength(0);
    expect(h.db.state.domainEffect.some(e => e.payload.audit.details.outcome === "unconfirmed")).toBe(true);
  });
  it("audit payloads omit passwords, OTPs, recovery tokens and raw failed-login addresses", async () => {
    await request("/admin-login", { email: "unknown@example.invalid", password: PASSWORD });
    await authService.forgotPassword(user.email);
    const payload = JSON.stringify(h.db.state.domainEffect);
    expect(payload).not.toContain(PASSWORD); expect(payload).not.toContain("unknown@example.invalid");
    const token = h.messages[0].html.split("token=")[1]; expect(payload).not.toContain(token);
    expect(h.db.state.domainEffect.find(e => e.payload.audit.action === "LOGIN_FAILED").payload.audit.details.account).toMatch(/^[a-f0-9]{64}$/);
  });
});
