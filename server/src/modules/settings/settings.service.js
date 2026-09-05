import { settingsRepository } from "./settings.repository.js";
import { auditLogService } from "../auditLogs/auditLog.service.js";
import { ACTIONS } from "../auditLogs/auditLog.constants.js";

export const settingsService = {
  async getSettings() {
    let settings = await settingsRepository.find();

    if (!settings) {
      settings = await settingsRepository.update({});
    }

    return settings;
  },

  async updateSettings(data, userId, ipAddress) {
    const settings = await settingsRepository.update(data);
    auditLogService.logAction({
      userId,
      action: ACTIONS.SETTINGS_UPDATED,
      targetType: "settings",
      details: { fields: Object.keys(data) },
      ipAddress,
    }).catch(() => {});
    return settings;
  },
};
