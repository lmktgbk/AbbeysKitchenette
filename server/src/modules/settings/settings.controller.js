import { settingsService } from "./settings.service.js";
import { automationScheduler } from "../automation/automation.scheduler.js";
import { successResponse, controllerError } from "../../utils/response.js";
import { AppError } from "../../middleware/errorHandler.middleware.js";

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
      automationScheduler.reschedule().catch((err) => console.warn("[automation] reschedule dropped:", err?.message));
      return successResponse(res, "Settings updated", { settings });
    } catch (error) {
      return handleError(res, error, "UPDATE_SETTINGS_ERROR");
    }
  },
};
