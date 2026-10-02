import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "./env.js";

/**
 * JWT Configuration
 *
 * Handles signing (creating) and verifying (decoding) JSON Web Tokens.
 * Tokens are stored as httpOnly cookies on the client side.
 *
 * Sessions carry sub, role and the database session version. Recovery and
 * password-login challenges have separate purposes and audiences.
 */

/**
 * Signs a JWT token with the given payload.
 * Token expires in the configured time (defaults to 8 hours).
 *
 * @param {object} payload - Subject and purpose-specific claims
 * @returns {string} The signed JWT string
 */
export function signToken(payload, expiresIn) {
  const purpose = payload.purpose ?? "session";
  return jwt.sign({ ...payload, purpose }, env.JWT_SECRET, {
    algorithm: "HS256",
    issuer: "smartcafe",
    audience: `smartcafe:${purpose}`,
    jwtid: crypto.randomUUID(),
    expiresIn: expiresIn ?? env.JWT_EXPIRES_IN,
  });
}

/**
 * Verifies and decodes a JWT token.
 * Throws if the token is invalid or expired.
 *
 * @param {string} token - The JWT string to verify
 * @returns {object} The verified claims, including expiration
 */
export function verifyToken(token, purpose) {
  const decoded = jwt.verify(token, env.JWT_SECRET, {
    algorithms: ["HS256"], issuer: "smartcafe",
    ...(purpose && { audience: `smartcafe:${purpose}` }),
  });
  if (typeof decoded !== "object" || !decoded.sub || (purpose && decoded.purpose !== purpose)) {
    throw new jwt.JsonWebTokenError("Invalid token purpose");
  }
  return decoded;
}

export function signSessionToken(user) {
  return signToken({ sub: user.id, role: user.role, version: user.sessionVersion });
}

// Recovery and login-challenge tokens cannot cross the session boundary.
export function verifySessionToken(token) {
  const decoded = verifyToken(token, "session");
  if (!Number.isSafeInteger(decoded.version) || decoded.version < 0 ||
      !["admin", "cashier", "kitchen"].includes(decoded.role)) {
    throw new jwt.JsonWebTokenError("Invalid session claims");
  }
  return decoded;
}
