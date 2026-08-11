import { AppError } from "./errorHandler.js";

/**
 * Authorization Middleware
 *
 * Restricts access based on user roles.
 * Must be used AFTER authenticate (which sets req.user).
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return next(new AppError(403, "Insufficient permissions", "FORBIDDEN"));
    }
    next();
  };
};

export default authorize;
