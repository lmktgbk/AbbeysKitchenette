import prisma from "../../config/prisma.js";
import { verifySessionToken } from "../../config/jwt.js";
import { AppError } from "../../middleware/errorHandler.middleware.js";

export const SESSION_USER_SELECT = {
  id: true, name: true, email: true, role: true, imageUrl: true,
  isActive: true, sessionVersion: true,
};

export function publicUser(user) {
  return Object.fromEntries(
    ["id", "name", "email", "role", "imageUrl", "isActive", "lastLoginAt", "createdAt", "updatedAt"]
      .filter(key => user[key] !== undefined).map(key => [key, user[key]]),
  );
}

// REST and WebSocket authentication share the same token and revocation policy.
export async function resolveSession(token) {
  if (!token) throw new AppError(401, "Not Authenticated", "UNAUTHORIZED");
  let claims;
  try {
    claims = verifySessionToken(token);
  } catch (error) {
    const expired = error.name === "TokenExpiredError";
    throw new AppError(401, expired ? "Session expired, please log in again" : "Invalid token",
      expired ? "TOKEN_EXPIRED" : "UNAUTHORIZED");
  }
  let user;
  try {
    user = await prisma.user.findUnique({ where: { id: claims.sub }, select: SESSION_USER_SELECT });
  } catch {
    // Provider errors can contain connection details; expose only a retryable failure.
    throw new AppError(503, "Authentication service unavailable", "AUTH_UNAVAILABLE");
  }
  if (!user?.isActive || user.sessionVersion !== claims.version || user.role !== claims.role) {
    throw new AppError(401, "Session is no longer valid, please log in again", "UNAUTHORIZED");
  }
  return { user, expiresAt: claims.exp * 1000 };
}
