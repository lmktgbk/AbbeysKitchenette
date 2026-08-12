import { AppError } from "./errorHandler.middleware.js";
import { isStoreIP } from "../utils/ipCheck.js";

/**
 * Middleware to restrict access to store devices only.
 *
 * Used on PIN login and staff-list endpoints to ensure
 * only in-store terminals can access these features.
 *
 * Note: Email login IP check happens in the service layer,
 * because we need to look up the user first to check their role.
 *
 * In development mode, always allows access (for testing outside the store).
 */
const requireStoreDevice = async (req, res, next) => {
  try {
    // Get the client's public IP address
    // req.ip is preferred, fallback to req.connection.remoteAddress for older Node versions
    const clientIp = req.ip || req.connection.remoteAddress;

    // Check if this IP is allowed (reads from database, handles IPv6 normalization)
    const allowed = await isStoreIP(clientIp);

    // If IP is not in the whitelist, reject the request
    if (!allowed) {
      return next(
        new AppError(
          403,
          "Access restricted to store devices",
          "STORE_IP_REQUIRED",
        ),
      );
    }

    // IP is allowed, continue to the next middleware/controller
    next();
  } catch (err) {
    // Pass any unexpected errors to the global error handler
    next(err);
  }
};

export default requireStoreDevice;
