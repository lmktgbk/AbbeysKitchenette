import prisma from "../config/prisma.js";
import { AppError } from "./errorHandler.js";
import { env } from "../config/env.js";

/**
 * Store Device Restriction Middleware
 *
 * Compares req.ip against the store IP whitelist in SystemSettings.
 * Used on PIN login and staff-list endpoints to ensure
 * only in-store terminals can access PIN-based features.
 *
 * In development mode, always allows access (for testing outside the store).

 * Flow:
 *   1. Fetch storeIpWhitelist from SystemSettings
 *   2. Split by comma → array of allowed IPs
 *   3. Check if req.ip is in the list
 *   4. If not → throw AppError(403, ..., 'STORE_IP_REQUIRED')
 *   5. If yes → call next()
 */
const requireStoreDevice = async (req, res, next) => {
  try {
    // In development, always allow (for testing outside the store)
    if (env.NODE_ENV === "development") {
      return next();
    }

    // Fetch allowed IPs from database
    const settings = await prisma.systemSettings.findUnique({
      where: { id: 1 },
      select: { storeIpWhitelist: true },
    });

    const allowedIPs =
      settings?.storeIpWhitelist
        ?.split(",")
        .map((ip) => ip.trim())
        .filter(Boolean) || [];

    // If no IPs configured, allow all (open mode)
    if (allowedIPs.length === 0) {
      return next();
    }

    // Check if client IP is in the whitelist
    const clientIP = req.ip || req.connection.remoteAddress;

    if (!allowedIPs.includes(clientIP)) {
      return next(
        new AppError(
          403,
          "Access restricted to store devices",
          "STORE_IP_REQUIRED",
        ),
      );
    }

    next();
  } catch (err) {
    next(err);
  }
};

export default requireStoreDevice;
