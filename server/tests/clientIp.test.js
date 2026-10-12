import { expect, it, vi } from "vitest";
vi.mock("../src/config/env.js", () => ({ env: {} }));
import { clientIpMiddleware, resolveClientIp } from "../src/middleware/clientIp.middleware.js";
import { upgradeClientKey } from "../src/infrastructure/realtime/limits.js";

const req = headers => ({ headers, socket: { remoteAddress: "100.64.0.1" } });
const railway = { CLIENT_IP_SOURCE: "railway", TRUST_PROXY_HOPS: 1 };

it("uses Railway's edge address despite a different forwarded chain", () => {
  const request = req({ "x-real-ip": "112.198.204.254", "x-forwarded-for": "203.0.113.7, 152.233.68.97" });
  expect(resolveClientIp(request, railway)).toBe("112.198.204.254");
  expect(upgradeClientKey(request, railway)).toBe("112.198.204.254");
  const next = vi.fn();
  clientIpMiddleware(railway)(request, {}, next);
  expect(request.ip).toBe("112.198.204.254");
  expect(next).toHaveBeenCalledOnce();
});

it.each([undefined, "bad", "112.198.204.254, 203.0.113.7", ["112.198.204.254", "203.0.113.7"]])("never falls back to a forged chain when edge header is invalid: %j", address => {
  expect(resolveClientIp(req({ "x-real-ip": address, "x-forwarded-for": "112.198.204.254" }), railway)).toBe("100.64.0.1");
});

it("ignores all forwarded headers for direct localhost requests", () => {
  expect(resolveClientIp(req({ "x-real-ip": "112.198.204.254", "x-forwarded-for": "112.198.204.254" }), { CLIENT_IP_SOURCE: "proxy", TRUST_PROXY_HOPS: 0 })).toBe("100.64.0.1");
});

it("retains the verified hop policy for non-Railway proxy deployments", () => {
  expect(resolveClientIp(req({ "x-real-ip": "112.198.204.254", "x-forwarded-for": "203.0.113.7, 152.233.68.97" }), { CLIENT_IP_SOURCE: "proxy", TRUST_PROXY_HOPS: 1 })).toBe("152.233.68.97");
});

it("accepts a single IPv6 address supplied by the configured ingress", () => {
  expect(resolveClientIp(req({ "x-real-ip": "2001:db8::1" }), railway)).toBe("2001:db8::1");
});
