import { settingsService } from "./settings.service.js";
import { successResponse, errorResponse } from "../../utils/response.js";
import { AppError } from "../../middleware/errorHandler.middleware.js";

function handleError(res, error, fallbackCode) {
  if (error instanceof AppError) {
    return errorResponse(res, error.message, null, error.statusCode, error.code);
  }
  console.error(`[${fallbackCode}]`, error);
  return errorResponse(res, "Something went wrong", null, 500, fallbackCode);
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
      return successResponse(res, "Settings updated", { settings });
    } catch (error) {
      return handleError(res, error, "UPDATE_SETTINGS_ERROR");
    }
  },
};
