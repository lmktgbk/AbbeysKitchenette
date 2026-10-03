import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import express from "express";
import http from "node:http";
import cookieParser from "cookie-parser";
vi.mock("../src/config/env.js", () => ({ env: { NODE_ENV: "production", COOKIE_SAME_SITE: "none" } }));
vi.mock("../src/modules/auth/auth.service.js", () => ({ authService: {
  login: vi.fn(async () => ({ token: "private-session", user: { id: "fixture", role: "cashier" } })),
  adminLogin: vi.fn(async () => ({ requiresOtp: true, challenge: "private-challenge", user: { id: "fixture" } })),
  verifyOtp: vi.fn(async () => ({ token: "private-session", user: { id: "fixture" } })),
  logout: vi.fn(async () => {}),
} }));
vi.mock("../src/modules/auditLogs/auditLog.service.js", () => ({ auditLogService: { logAction: vi.fn(async () => {}) } }));
import { authController } from "../src/modules/auth/auth.controller.js";
describe("production session cookie flow", () => {
  let server, url;
  beforeAll(async () => {
    const app = express(); app.use(express.json(), cookieParser());
    app.use((req, _, next) => { req.user = { id: "fixture" }; req.sessionVersion = 1; next(); });
    for (const method of ["login", "adminLogin", "verifyOtp", "logout"]) app.post(`/${method}`, authController[method]);
    server = http.createServer(app); await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    url = `http://127.0.0.1:${server.address().port}`;
  });
  afterAll(async () => { await new Promise(resolve => server.close(resolve)); });
  const post = method => fetch(`${url}/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "fixture@example.com", password: "fixture", userId: "fixture", code: "123456" }) });
  const secure = cookie => {
    expect(cookie).toContain("HttpOnly"); expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=None"); expect(cookie).not.toContain("Domain=");
  };
  it("login sets a protected host-only cookie without exposing the token in JSON", async () => {
    const response = await post("login"); expect(response.status).toBe(200);
    const cookie = response.headers.getSetCookie()[0]; secure(cookie); expect(cookie).toContain("Path=/;");
    expect(JSON.stringify(await response.json())).not.toContain("private-session");
  });
  it("OTP sets the challenge path and clears it with matching flags after verification", async () => {
    const challenge = (await post("adminLogin")).headers.getSetCookie()[0]; secure(challenge); expect(challenge).toContain("Path=/api/auth;");
    const cookies = (await post("verifyOtp")).headers.getSetCookie(); expect(cookies).toHaveLength(2);
    cookies.forEach(secure); expect(cookies[1]).toContain("login_challenge=;"); expect(cookies[1]).toContain("Path=/api/auth;");
  });
  it("logout clears both cookies using their original paths and security flags", async () => {
    const cookies = (await post("logout")).headers.getSetCookie(); expect(cookies).toHaveLength(2); cookies.forEach(secure);
    expect(cookies[0]).toContain("token=;"); expect(cookies[0]).toContain("Path=/;"); expect(cookies[1]).toContain("Path=/api/auth;");
  });
});
