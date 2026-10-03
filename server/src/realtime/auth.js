/**
 * WebSocket authentication shares REST token purpose, expiry and revocation checks.
 * Browsers send the host-only session cookie when the configured cookie policy
 * permits it. Explicit non-browser clients may authenticate by message;
 * frontend code never needs a JavaScript-readable session token.
 */

import { publicUser, resolveSession } from "../modules/auth/session.js";

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of String(header).split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    try {
      out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
    } catch {
      // Malformed cookie encodings must not crash the upgrade handler.
      return {};
    }
  }
  return out;
}

function bearerFromProtocols(protocols) {
  // Optional convention: Sec-WebSocket-Protocol: ["realtime", "Bearer <jwt>"]
  // (subprotocol echo is harmless; auth is decided below, not by agreement).
  const values = typeof protocols === "string" ? protocols.split(",").map(p => p.trim()) : protocols ?? [];
  for (const p of values) {
    if (p.startsWith("Bearer ")) return p.slice("Bearer ".length);
  }
  return null;
}

export function extractUpgradeToken(req) {
  return (
    parseCookies(req.headers?.cookie).token ||
    bearerFromProtocols(req.headers?.["sec-websocket-protocol"]) ||
    null
  );
}

/**
 * Resolve a token to an authed user (throws AppError-shaped Error on failure).
 * @param {string} token
 * @returns {Promise<{ id, name, email, role }>}
 */
export async function resolveUser(token) {
  try {
    const { user, expiresAt } = await resolveSession(token);
    return { ...publicUser(user), expiresAt };
  } catch (error) {
    error.status = error.statusCode ?? 503;
    throw error;
  }
}

const STAFF_ROLES = new Set(["admin", "cashier", "kitchen"]);

/**
 * Topic ACL — decides whether an authed user may subscribe.
 * Public guest topics carry their own token check at subscribe time
 * (see realtime/server.js): possession of the tracking token authorizes.
 * @param {{ id, role }} user
 * @param {string} topic
 * @returns {boolean}
 */
export function canSubscribe(user, topic) {
  if (!user) return false;
  if (topic === "orders" || topic === "kitchen" || topic === "inventory" || topic === "products") {
    return STAFF_ROLES.has(user.role);
  }
  if (topic === "shifts") return STAFF_ROLES.has(user.role);
  if (
    topic === "dashboard" ||
    topic === "anomaly" ||
    topic === "staff" ||
    topic === "audit" ||
    topic === "settings" ||
    topic === "transactions"
  ) {
    return user.role === "admin";
  }
  if (topic.startsWith("notifications:")) {
    const target = topic.slice("notifications:".length);
    return target === user.id || user.role === "admin";
  }
  if (topic.startsWith("jobs:")) return STAFF_ROLES.has(user.role);
  return false;
}
