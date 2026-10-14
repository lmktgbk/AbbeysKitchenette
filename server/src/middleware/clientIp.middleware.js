import { isIP } from "node:net";
import proxyaddr from "proxy-addr";
import { createHmac, timingSafeEqual } from "node:crypto";

/** Resolve HTTP and WebSocket identities consistently. Railway mode is only for
 * its public HTTP ingress, which replaces X-Real-IP. Same-environment private
 * callers bypass that ingress and must be trusted; headers cannot prove origin.
 */
export function resolveClientIp(req, config) {
  const ip = req.headers["x-smartcafe-proxy-ip"];
  const timestamp = req.headers["x-smartcafe-proxy-time"];
  const signature = req.headers["x-smartcafe-proxy-signature"];
  if (config.API_PROXY_SECRET && typeof ip === "string" && isIP(ip) &&
      typeof timestamp === "string" && /^\d{13}$/.test(timestamp) && Math.abs(Date.now() - Number(timestamp)) <= 60000 &&
      typeof signature === "string" && /^[a-f0-9]{64}$/.test(signature)) {
    const payload = [req.method, req.originalUrl ?? req.url, timestamp, ip].join("\n");
    const expected = createHmac("sha256", config.API_PROXY_SECRET).update(payload).digest();
    if (timingSafeEqual(expected, Buffer.from(signature, "hex"))) {
      req.clientIpSource = "signed-vercel-proxy";
      return ip;
    }
  }
  if (config.CLIENT_IP_SOURCE === "railway") {
    const address = req.headers["x-real-ip"];
    // Accept one literal address, never a forwarded chain. Missing/invalid edge
    // headers fall back to the socket, not attacker-controlled X-Forwarded-For.
    return typeof address === "string" && isIP(address)
      ? address : req.socket.remoteAddress;
  }
  return proxyaddr(req, (_, hop) => hop < (config.TRUST_PROXY_HOPS ?? 0));
}

/** Set the request identity before rate limits, authentication and store checks. */
export function clientIpMiddleware(config) {
  return (req, _res, next) => {
    Object.defineProperty(req, "ip", { configurable: true, value: resolveClientIp(req, config) });
    next();
  };
}
