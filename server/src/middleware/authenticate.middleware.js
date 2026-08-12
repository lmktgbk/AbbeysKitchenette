import { verifyToken } from "../config/jwt.js";
import { AppError } from "./errorHandler.middleware.js";
import prisma from "../config/prisma.js";

/**
 * Authentication Middleware
 *
 * Verifies JWT from cookie or Authorization header.
 * Attaches user to req.user on success.
 * Throws AppError if not authenticated or token is invalid.
 */

const authenticate = async (req, res, next) => {
  try {
    // Extract token from httpOnly cookie or bearer header
    const token =
      req.cookies?.token || req.headers.authorization?.replace("Bearer ", "");

    if (!token) {
      throw new AppError(401, "Not Authenticated", "UNAUTHORIZED");
    }

    // Verify jwt signature and decode payload
    const decoded = verifyToken(token);

    // Fetch user from DB to confirm they still exist and are active
    // This prevents login after account deletion/deactivation
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
      },
    });

    if (!user || !user.isActive) {
      throw new AppError(
        401,
        "Account not found or deactivated",
        "UNAUTHORIZED",
      );
    }

    // Attach user to request for downstream middleware/routes
    req.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    };

    next();
  } catch (err) {
    // Handle JWT-specific errors with clear messages
    if (err.name === "JsonWebTokenError") {
      return next(new AppError(401, "Invalid token", "UNAUTHORIZED"));
    }
    if (err.name === "TokenExpiredError") {
      return next(
        new AppError(
          401,
          "Session expired, please log in again",
          "TOKEN_EXPIRED",
        ),
      );
    }
    next(err);
  }
};

export default authenticate;
