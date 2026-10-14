import { afterEach, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import proxy from "../../client/api/proxy.js";
import { resolveClientIp } from "../src/middleware/clientIp.middleware.js";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
const secret = "test-proxy-secret-at-least-thirty-two-characters";
it("forwards cookies and attests the edge IP while stripping forged credentials and caching", async () => {
  vi.stubEnv("API_UPSTREAM_ORIGIN", "https://api.example.com"); vi.stubEnv("API_PROXY_SECRET", secret);
  const fetcher = vi.fn().mockResolvedValue(new Response('{"success":true}', { headers: { "set-cookie": "token=issued; HttpOnly; Secure; Path=/", "content-type": "application/json" } }));
  vi.stubGlobal("fetch", fetcher);
  const response = await proxy(new Request("https://app.example.com/api/proxy?path=auth/me", { headers: {
    "x-forwarded-for": "112.198.204.254", "x-smartcafe-proxy-ip": "attacker", cookie: "token=session; login_challenge=challenge; unrelated=secret",
  } }));
  const [url, options] = fetcher.mock.calls[0];
  expect(url.href).toBe("https://api.example.com/api/auth/me");
  expect(options.headers.get("cookie")).toBe("token=session; login_challenge=challenge");
  const headers = Object.fromEntries(options.headers);
  expect(resolveClientIp({ method: "GET", originalUrl: "/api/auth/me", headers, socket: { remoteAddress: "100.64.0.1" } }, { API_PROXY_SECRET: secret })).toBe("112.198.204.254");
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(response.headers.getSetCookie()).toEqual(["token=issued; HttpOnly; Secure; Path=/"]);
});
it.each(["bad", "stale", "different-route"])("rejects %s IP attestations and uses the configured ingress", kind => {
  const timestamp = String(Date.now() - (kind === "stale" ? 90000 : 0));
  const signature = createHmac("sha256", secret).update(["POST", "/api/auth/login", timestamp, "112.198.204.254"].join("\n")).digest("hex");
  expect(resolveClientIp({ method: "POST", originalUrl: kind === "different-route" ? "/api/guest/orders" : "/api/auth/login", headers: {
    "x-smartcafe-proxy-ip": "112.198.204.254", "x-smartcafe-proxy-time": timestamp,
    "x-smartcafe-proxy-signature": kind === "bad" ? "0".repeat(64) : signature, "x-real-ip": "203.0.113.1",
  }, socket: { remoteAddress: "100.64.0.1" } }, { CLIENT_IP_SOURCE: "railway", API_PROXY_SECRET: secret })).toBe("203.0.113.1");
});
it("fails closed without configuration or an attested edge address", async () => {
  vi.stubEnv("API_PROXY_SECRET", "");
  expect((await proxy(new Request("https://app.example.com/api/proxy?path=auth/me"))).status).toBe(503);
});
