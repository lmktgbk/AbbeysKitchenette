import { settingsRepository } from "./settings.repository.js";
import { auditLogService } from "../auditLogs/auditLog.service.js";
import { ACTIONS } from "../auditLogs/auditLog.constants.js";
import { notificationService } from "../notifications/notification.service.js";

export const DEFAULT_PAYMENTS = ["cash", "gcash", "maya"];

/**
 * Settings Service
 *
 * Single-row system config (singleton id=1, auto-created on first read).
 * Writes diff before saving: unchanged PATCHes return silently instead of
 * spamming audit + notifications, and only real payment changes bust the
 * accepted-payments cache that every order creation reads.
 */
// Short-lived cache: payment checks run on every order creation.
let _paymentsCache = null;
let _paymentsCacheAt = 0;
const PAYMENTS_TTL_MS = 60 * 1000;

export const settingsService = {
  async getSettings() {
    let settings = await settingsRepository.find();

    if (!settings) {
      settings = await settingsRepository.update({});
    }

    return settings;
  },

  async updateSettings(data, userId) {
    // Normalize: trim strings, empty → null (PATCH-omitted stays untouched,
    // explicit "" clears the field instead of storing whitespace).
    const normalized = {};
    for (const [key, value] of Object.entries(data ?? {})) {
      if (typeof value === "string") {
        const trimmed = value.trim();
        normalized[key] = trimmed === "" ? null : trimmed;
      } else {
        normalized[key] = value;
      }
    }

    const current = await settingsRepository.find();
    const changed = Object.keys(normalized).filter((key) => {
      const before = current?.[key] ?? null;
      const after = normalized[key] ?? null;
      return JSON.stringify(before) !== JSON.stringify(after);
    });

    // No-op save: return current row without spamming audit/notification.
    if (changed.length === 0) {
      return current ?? settingsRepository.update({});
    }

    const settings = await settingsRepository.update(normalized);

    // Payment availability may have changed — drop the cache.
    _paymentsCache = null;

    auditLogService.logAction({
      userId,
      action: ACTIONS.SETTINGS_UPDATED,
      targetType: "settings",
      details: { fields: changed },
    }).catch(() => {});

    notificationService.create({
      type: "system",
      title: "Settings Updated",
      message: `System settings updated: ${changed.join(", ")}`,
      referenceType: "settings",
    }).catch(() => {});

    return settings;
  },

  /**
   * Accepted payment methods (cached 60s — called on every order creation).
   * Falls back to all three when unset (fresh DBs before BR08 runs).
   */
  async getAcceptedPayments() {
    if (_paymentsCache && Date.now() - _paymentsCacheAt < PAYMENTS_TTL_MS) {
      return _paymentsCache;
    }
    try {
      const settings = await settingsRepository.find();
      const list = settings?.acceptedPayments;
      _paymentsCache =
        Array.isArray(list) && list.length > 0 ? list : [...DEFAULT_PAYMENTS];
    } catch {
      _paymentsCache = [...DEFAULT_PAYMENTS];
    }
    _paymentsCacheAt = Date.now();
    return _paymentsCache;
  },
};
