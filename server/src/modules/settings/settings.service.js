import { settingsRepository } from "./settings.repository.js";
import prisma from "../../config/prisma.js";
import { recordEffects } from "../../infrastructure/effects/domainEffects.js";
import { ACTIONS } from "../auditLogs/auditLog.constants.js";

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

    const settings = await prisma.$transaction(async tx => {
      await settingsRepository.ensure(tx);
      // Serialize the diff with the write so two identical saves create one event.
      await tx.$queryRaw`SELECT id FROM system_settings WHERE id = 1 FOR UPDATE`;
      const current = await settingsRepository.find(tx);
      const changed = Object.keys(normalized).filter(key =>
        JSON.stringify(current?.[key] ?? null) !== JSON.stringify(normalized[key] ?? null));
      if (!changed.length) return current;
      const updated = await settingsRepository.update(normalized, tx);
      await recordEffects(tx, {
        audit: { userId, action: ACTIONS.SETTINGS_UPDATED, targetType: "settings", details: { fields: changed } },
        notifications: [{ type: "system", title: "Settings Updated",
          message: `System settings updated: ${changed.join(", ")}`, referenceType: "settings" }],
      });
      return updated;
    }, { timeout: 5000 });
    _paymentsCache = null;

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
