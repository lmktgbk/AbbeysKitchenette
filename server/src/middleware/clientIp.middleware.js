import { isIP } from "node:net";
import proxyaddr from "proxy-addr";

/** Resolve HTTP and WebSocket identities consistently. Railway mode is only for
 * its public HTTP ingress, which replaces X-Real-IP. Same-environment private
 * callers bypass that ingress and must be trusted; headers cannot prove origin.
 */
export function resolveClientIp(req, config) {
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
