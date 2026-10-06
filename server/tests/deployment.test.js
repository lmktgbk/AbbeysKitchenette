import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import express from "express";
import http from "node:http";
import proxyaddr from "proxy-addr";
vi.mock("../src/config/env.js", () => ({ env: { NODE_ENV: "test" } }));
import { parseEnvironment } from "../src/config/env.schema.js";
import { sessionCookieOptions } from "../src/config/cookies.js";
import { browserCors, browserWriteGuard, acceptsWebSocketOrigin } from "../src/middleware/browserSecurity.middleware.js";
const production = {
  NODE_ENV: "production", CLIENT_URL: "https://smartcafe.vercel.app", API_PUBLIC_URL: "https://api.example.com",
  TRUST_PROXY_HOPS: "1", COOKIE_SAME_SITE: "none", JWT_SECRET: "7a".repeat(32), JWT_EXPIRES_IN: "8h",
  DATABASE_URL: "postgresql://fixture:fixture@db.example.com/db?sslmode=verify-full",
  DIRECT_URL: "postgresql://fixture:fixture@db.example.com/db?sslmode=verify-full",
  GMAIL_USER: "mailer@example.com", GMAIL_APP_PASS: "fixture", EMAIL_FROM: "mailer@example.com",
};

describe("proxy trust subnet security", () => {
  // Incorrect mapped prefixes must never turn an arbitrary visitor into a trusted proxy.
  it.each(["::ffff:10.0.0.0/8", "::/1"])("does not trust public IPv4 through %s", subnet => {
    const trust = proxyaddr.compile(subnet);
    expect(trust("203.0.113.42", 0)).toBe(false);
    expect(proxyaddr({ socket: { remoteAddress: "203.0.113.42" }, headers: {
      "x-forwarded-for": "198.51.100.10",
    } }, trust)).toBe("203.0.113.42");
  });
  it("preserves correctly specified private IPv4 proxy subnets", () => {
    for (const subnet of ["10.0.0.0/8", "::ffff:10.0.0.0/104"]) {
      const trust = proxyaddr.compile(subnet);
      expect(trust("10.1.2.3", 0)).toBe(true);
      expect(trust("203.0.113.42", 0)).toBe(false);
    }
  });
});
describe("production configuration", () => {
  it("keeps local defaults and normalizes origins", () => {
    const config = parseEnvironment({ ...production, NODE_ENV: "development", CLIENT_URL: "http://localhost:5173/", COOKIE_SAME_SITE: "strict", TRUST_PROXY_HOPS: undefined, RATE_LIMIT_STORE: undefined });
    expect(config.CLIENT_URL).toBe("http://localhost:5173"); expect(config.TRUST_PROXY_HOPS).toBe(0); expect(config.RATE_LIMIT_STORE).toBe("memory");
  });
  it("accepts the explicit production setup with a shared rate store", () => {
    expect(parseEnvironment(production).RATE_LIMIT_STORE).toBe("postgres");
  });
  it.each([
    { CLIENT_URL: "not-a-url" }, { FORECAST_URL: "not-a-url" },
    { CLIENT_URL: "http://frontend.example.com" }, { CLIENT_URL: "https://frontend.example.com/path" },
    { API_PUBLIC_URL: undefined }, { TRUST_PROXY_HOPS: undefined }, { TRUST_PROXY_HOPS: "true" },
    { RATE_LIMIT_STORE: "memory" }, { DATABASE_URL: "postgresql://fixture@db.example.com/db?sslmode=require" },
    { DIRECT_URL: "postgresql://fixture@db.example.com/db" }, { JWT_SECRET: "change-me-to-a-long-random-string-32-chars-min" },
    { GMAIL_APP_PASS: undefined }, { EMAIL_FROM: "Shop Name" }, { CLOUDINARY_CLOUD_NAME: "partial" },
    { GOOGLE_SERVICE_ACCOUNT_EMAIL: "partial@example.com" }, { PORT: "65536" },
  ])("rejects unsafe or incomplete production input: %j", override => {
    expect(() => parseEnvironment({ ...production, ...override })).toThrow("Invalid environment");
  });
  it("accepts blank optional SMTP settings and rejects insecure cross-site dev cookies", () => {
    expect(parseEnvironment({ ...production, SMTP_PORT: "", SMTP_HOST: "" }).SMTP_PORT).toBeUndefined();
    expect(() => parseEnvironment({ ...production, NODE_ENV: "development" })).toThrow("COOKIE_SAME_SITE");
  });
  it("sets host-only HttpOnly secure cookies and uses the same options when clearing", () => {
    expect(sessionCookieOptions(parseEnvironment(production))).toMatchObject({ httpOnly: true, secure: true, sameSite: "none", path: "/" });
    expect(sessionCookieOptions(production).domain).toBeUndefined();
    expect(sessionCookieOptions({ NODE_ENV: "development" }).sameSite).toBe("strict");
  });
});
describe("real HTTP origin and proxy boundaries", () => {
  let server, base;
  beforeAll(async () => {
    const config = parseEnvironment(production);
    const app = express(); app.set("trust proxy", config.TRUST_PROXY_HOPS);
    app.use(browserCors(config), browserWriteGuard(config), express.json());
    app.get("/ip", (req, res) => res.json({ ip: req.ip }));
    app.post("/write", (req, res) => res.json({ saved: true }));
    server = http.createServer(app); await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  });
  afterAll(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  it("accepts an allowed browser write and its credentialed preflight", async () => {
    const headers = { Origin: production.CLIENT_URL, "X-SmartCafe-Request": "1" };
    expect((await fetch(base + "/write", { method: "POST", headers })).status).toBe(200);
    const preflight = await fetch(base + "/write", { method: "OPTIONS", headers: { Origin: production.CLIENT_URL,
      "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "x-smartcafe-request,content-type" } });
    expect(preflight.status).toBe(204); expect(preflight.headers.get("access-control-allow-origin")).toBe(production.CLIENT_URL);
    expect(preflight.headers.get("access-control-allow-credentials")).toBe("true");
  });
  it.each([{}, { Origin: "https://attacker.invalid", "X-SmartCafe-Request": "1" }, { Origin: production.CLIENT_URL },
    { Origin: "null", "X-SmartCafe-Request": "1" }])("rejects an unverifiable browser write before its handler: %j", async headers => {
    expect((await fetch(base + "/write", { method: "POST", headers })).status).toBe(403);
  });
  it("ignores a forged leftmost forwarded IP with one verified proxy hop", async () => {
    const response = await fetch(base + "/ip", { headers: { "X-Forwarded-For": "198.51.100.99, 203.0.113.10" } });
    expect((await response.json()).ip).toBe("203.0.113.10");
  });
  it("does not grant credentialed CORS to another frontend", async () => {
    const response = await fetch(base + "/ip", { headers: { Origin: "https://attacker.invalid" } });
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });
  it("requires the allowed browser origin for production WebSockets", () => {
    expect(acceptsWebSocketOrigin({ headers: { origin: production.CLIENT_URL } }, production)).toBe(true);
    expect(acceptsWebSocketOrigin({ headers: { origin: "https://attacker.invalid" } }, production)).toBe(false);
    expect(acceptsWebSocketOrigin({ headers: {} }, production)).toBe(false);
  });
});
