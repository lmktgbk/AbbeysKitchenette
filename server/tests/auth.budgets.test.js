import { beforeAll, afterAll, beforeEach, expect, it, vi } from "vitest";
import express from "express";
import { createHash } from "node:crypto";
vi.mock("../src/config/env.js", () => ({ env: { RATE_LIMIT_STORE: "memory" } }));
vi.mock("../src/config/prisma.js", () => ({ default: {} }));
import { authLimiter, accountLimiter, loginLimiter, otpVerifyLimiter, otpResendLimiter, recoveryLimiter, recoveryAccountLimiter, resetLimiter } from "../src/middleware/rateLimit.middleware.js";
let server, base;
beforeAll(async () => {
  const app = express(); app.set("trust proxy", 1); app.use(express.json(), authLimiter);
  app.post("/login", loginLimiter, accountLimiter, (req, res) => res.status(req.body.status || (req.body.fail ? 401 : 200)).json({}));
  app.post("/verify", otpVerifyLimiter, (_req, res) => res.json({}));
  app.post("/resend", otpResendLimiter, (_req, res) => res.json({}));
  app.post("/recover", recoveryLimiter, recoveryAccountLimiter, (_req, res) => res.json({}));
  app.post("/reset", resetLimiter, (_req, res) => res.json({}));
  server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
beforeEach(() => {
  for (const limiter of [authLimiter, loginLimiter, otpVerifyLimiter, otpResendLimiter, recoveryLimiter, resetLimiter]) limiter.resetKey("203.0.113.1");
  const key = createHash("sha256").update("staff@example.com").digest("hex");
  accountLimiter.resetKey(key); recoveryAccountLimiter.resetKey(key);
});
const post = (path, body = {}, ip = "203.0.113.1") => fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json", "X-Forwarded-For": ip }, body: JSON.stringify(body) });
it("admits repeated successful login/OTP flows for two staff sharing one public IP", async () => {
  for (let i = 0; i < 8; i++) {
    expect((await post("/login", { email: `staff${i % 2}@example.com` })).status).toBe(200);
    expect((await post("/verify")).status).toBe(200);
  }
});
it("recovery and resend exhaustion do not consume the independent verification budget", async () => {
  for (let i = 0; i < 20; i++) await post("/resend");
  expect((await post("/resend")).status).toBe(429);
  for (let i = 0; i < 3; i++) expect((await post("/recover", { email: "staff@example.com" })).status).toBe(200);
  expect((await post("/recover", { email: " STAFF@EXAMPLE.COM " })).status).toBe(429);
  expect((await post("/verify")).status).toBe(200);
  expect((await post("/login", { email: "staff@example.com" })).status).toBe(200);
});
it("store-policy rejection and email outages do not spend the account password budget", async () => {
  for (let i = 0; i < 12; i++) expect((await post("/login", { email: "staff@example.com", status: i % 2 ? 403 : 503 })).status).toBe(i % 2 ? 403 : 503);
  expect((await post("/login", { email: "staff@example.com" })).status).toBe(200);
});
it("normalizes account keys across IPs and returns the actual action wait time", async () => {
  for (let i = 0; i < 5; i++) expect((await post("/login", { email: "staff@example.com", fail: true }, `203.0.113.${i + 10}`)).status).toBe(401);
  const response = await post("/login", { email: " STAFF@EXAMPLE.COM ", fail: true });
  expect(response.status).toBe(429);
  expect((await response.json()).error).toBe("ACCOUNT_RATE_LIMIT_EXCEEDED");
});
it("retains the 100-request outer budget across distinct authentication actions", async () => {
  const paths = ["/login", "/verify", "/resend", "/reset"];
  for (let i = 0; i < 100; i++) await post(paths[i % paths.length]);
  const response = await post("/verify"); const result = await response.json();
  expect(result.error).toBe("AUTH_RATE_LIMIT_EXCEEDED");
  expect(result.data.retryAfterSeconds).toBeGreaterThan(0);
  expect(Number(response.headers.get("retry-after"))).toBe(result.data.retryAfterSeconds);
});
it("expires the verification window after five minutes without extending it on rejection", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  const start = Date.now(); const ip = "203.0.113.201";
  try {
    for (let i = 0; i < 50; i++) expect((await post("/verify", {}, ip)).status).toBe(200);
    const limited = await post("/verify", {}, ip);
    expect(limited.status).toBe(429);
    expect((await limited.json()).data.retryAfterSeconds).toBe(300);
    vi.setSystemTime(start + 290000);
    const retry = await post("/verify", {}, ip);
    expect((await retry.json()).data.retryAfterSeconds).toBe(10);
    vi.setSystemTime(start + 300001);
    expect((await post("/verify", {}, ip)).status).toBe(200);
  } finally { vi.useRealTimers(); }
});
