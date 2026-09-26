/**
 * WebSocket Upgrade Auth + Topic ACL.
 *
 * WHY it exists: browsers can't set headers on a WS handshake, so the
 * Bearer path is unavailable — same-origin clients authenticate via the
 * httpOnly session cookie (sent automatically), cross-origin clients via a
 * first-message `{ type: "auth", token }`. Mirrors authenticate.middleware.js
 * (signature verify + active-user check); session tokens carry `role`, so
 * password-reset tokens (purpose-only) are rejected here.
 */

import prisma from "../config/prisma.js";
import { verifyToken } from "../config/jwt.js";

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of String(header).split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

function bearerFromProtocols(protocols) {
  // Optional convention: Sec-WebSocket-Protocol: ["realtime", "Bearer <jwt>"]
  // (subprotocol echo is harmless; auth is decided below, not by agreement).
  for (const p of protocols || []) {
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
  if (!token) {
    const err = new Error("Not Authenticated");
    err.status = 401;
    err.code = "UNAUTHORIZED";
    throw err;
  }
  let decoded;
  try {
    decoded = verifyToken(token);
  } catch (e) {
    const err = new Error(e.name === "TokenExpiredError" ? "Session expired, please log in again" : "Invalid token");
    err.status = 401;
    err.code = e.name === "TokenExpiredError" ? "TOKEN_EXPIRED" : "UNAUTHORIZED";
    throw err;
  }
  if (!decoded?.role) {
    const err = new Error("Invalid token");
    err.status = 401;
    err.code = "UNAUTHORIZED";
    throw err;
  }
  const user = await prisma.user.findUnique({
    where: { id: decoded.sub },
    select: { id: true, name: true, email: true, role: true, isActive: true },
  });
  if (!user || !user.isActive) {
    const err = new Error("Account not found or deactivated");
    err.status = 401;
    err.code = "UNAUTHORIZED";
    throw err;
  }
  return { id: user.id, name: user.name, email: user.email, role: user.role };
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
