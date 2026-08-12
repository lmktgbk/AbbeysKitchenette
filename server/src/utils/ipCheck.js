import prisma from "../config/prisma.js";
import { env } from "../config/env.js";

/**
 * Checks if the request is coming from a store device.
 *
 * We verify the PUBLIC IP address (not the device's hardware/MAC address).
 * All devices at the store share the same public IP (the router's IP from the ISP).
 * @param {string} clientIP - The public IP of the device making the request (from req.ip)
 * @returns {boolean} - true if allowed, false if not
 */
export async function isStoreIP(clientIP) {
  // In development, always allow access (for testing outside the store)
  if (env.NODE_ENV === "development") return true;

  // Fetch the IP whitelist from the database
  // SystemSettings is a single-row table (id: 1) that stores store configuration
  const settings = await prisma.systemSettings.findUnique({
    where: { id: 1 },
    select: { storeIpWhitelist: true },
  });

  // Parse the comma-separated IP string into an array
  // Example: "203.0.113.50,192.168.1.100" → ["203.0.113.50", "192.168.1.100"]
  // Also normalize each IP by stripping the IPv6 prefix (::ffff:) if present
  const allowedIPs =
    settings?.storeIpWhitelist
      ?.split(",")
      .map((ip) => ip.replace("::ffff:", "").trim())
      .filter(Boolean) || [];

  // If no IPs are configured, allow all requests (open mode)
  // This is a fallback for initial setup before the admin configures the whitelist
  if (allowedIPs.length === 0) return true;

  // Normalize the client IP by stripping the IPv6 prefix (::ffff:)
  // Express sometimes returns IPs as "::ffff:192.168.1.100" (IPv6-mapped IPv4)
  // We strip it to compare as plain IPv4: "192.168.1.100"
  const normalizedIp = (clientIP || "").replace("::ffff:", "");

  // Check if the client IP is in the allowed list
  return allowedIPs.includes(normalizedIp);
}
