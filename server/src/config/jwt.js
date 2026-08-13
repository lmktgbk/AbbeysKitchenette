import jwt from "jsonwebtoken";
import { env } from "./env.js";

/**
 * JWT Configuration
 *
 * Handles signing (creating) and verifying (decoding) JSON Web Tokens.
 * Tokens are stored as httpOnly cookies on the client side.
 *
 * Payload structure: { id, role }
 * - id: user's UUID
 * - role: "admin" | "cashier" | "kitchen"
 */

/**
 * Signs a JWT token with the given payload.
 * Token expires in the configured time (defaults to 8 hours).
 *
 * @param {object} payload - Data to encode in the token (e.g. { id, role })
 * @returns {string} The signed JWT string
 */
export function signToken(payload) {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  });
}

/**
 * Verifies and decodes a JWT token.
 * Throws if the token is invalid or expired.
 *
 * @param {string} token - The JWT string to verify
 * @returns {object} The decoded payload (e.g. { id, role, iat, exp })
 */
export function verifyToken(token) {
  return jwt.verify(token, env.JWT_SECRET);
}
