import { settingsService } from "./settings.service.js";
import { automationScheduler } from "../automation/automation.scheduler.js";
import { successResponse, controllerError } from "../../utils/response.js";
import { AppError } from "../../middleware/errorHandler.middleware.js";
import { emitSettingsChanged } from "../../infrastructure/realtime/events.js";
import { isIP } from "node:net";
import { isStoreIP } from "../../utils/ipCheck.js";
import { env } from "../../config/env.js";

/**
 * Settings Controller (admin-only — router guard plus in-handler re-check)
 *
 * After a successful update, automation schedules reload without blocking
 * the response — cron changes take effect on the next tick, not instantly.
 */

function handleError(res, error, fallbackCode) {
  return controllerError(res, error, fallbackCode);
}

export const settingsController = {
  /** Inspect the same address used by staff/guest policy without trusting a
   * different header or changing the saved whitelist. Proxy hints are diagnostic only.
   */
  async checkNetwork(req, res) {
    try {
      if (req.user.role !== "admin") throw new AppError(403, "Only admins can access settings", "FORBIDDEN");
      const forwarded = req.get("x-real-ip") || "";
      res.set("Cache-Control", "no-store");
      return successResponse(res, "Network checked against saved settings", {
        address: req.ip,
        allowed: await isStoreIP(req.ip),
        developmentBypass: env.NODE_ENV === "development",
        proxyHops: env.TRUST_PROXY_HOPS,
        addressSource: env.CLIENT_IP_SOURCE ?? "proxy",
        // Report only a valid IP; attacker-controlled header text must not be echoed.
        proxyReportedAddress: isIP(forwarded) ? forwarded : null,
      });
    } catch (error) { return handleError(res, error, "CHECK_NETWORK_ERROR"); }
  },
  async getSettings(req, res) {
    try {
      if (req.user.role !== "admin") {
        throw new AppError(403, "Only admins can access settings", "FORBIDDEN");
      }

      const settings = await settingsService.getSettings();
      return successResponse(res, "Settings retrieved", { settings });
    } catch (error) {
      return handleError(res, error, "GET_SETTINGS_ERROR");
    }
  },

  async updateSettings(req, res) {
    try {
      if (req.user.role !== "admin") {
        throw new AppError(403, "Only admins can update settings", "FORBIDDEN");
      }

      const settings = await settingsService.updateSettings(req.body, req.user.id);
      // Automation schedules may have changed — reload without blocking the response.
      automationScheduler.reschedule().catch((err) => console.error("[automation] reschedule dropped:", err?.message));
      // Tills re-read hours/payments live.
      emitSettingsChanged();
      return successResponse(res, "Settings updated", { settings });
    } catch (error) {
      return handleError(res, error, "UPDATE_SETTINGS_ERROR");
    }
  },
};
