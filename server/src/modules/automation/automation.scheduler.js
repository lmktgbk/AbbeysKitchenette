import cron from "node-cron";

import { settingsRepository } from "../settings/settings.repository.js";
import { reorderSuggestionsService } from "../reorderSuggestions/reorderSuggestions.service.js";
import { wasteReductionService } from "../wasteReduction/wasteReduction.service.js";
import { auditLogService } from "../auditLogs/auditLog.service.js";
import { ACTIONS } from "../auditLogs/auditLog.constants.js";

const PYTHON_URL = process.env.FORECAST_URL || "http://localhost:8000";

// NOTE: single-server assumption — two backends running = double runs.

const DAY_TO_CRON = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

const JOB_DEFS = {
  forecast: { audit: ACTIONS.FORECAST_RUN, targetType: "forecast" },
  reorder: { audit: ACTIONS.REORDER_RUN, targetType: "reorder" },
  waste: { audit: ACTIONS.WASTE_RUN, targetType: "waste" },
  marketBasket: { audit: ACTIONS.MBA_RUN, targetType: "market_basket" },
};

function toCronExpr(job) {
  const [h, m] = job.time.split(":").map(Number);
  if (job.frequency === "daily") return `${m} ${h} * * *`;
  return `${m} ${h} * * ${DAY_TO_CRON[job.day]}`;
}

async function postToML(path) {
  const response = await fetch(`${PYTHON_URL}${path}`, { method: "POST" });
  if (!response.ok) {
    throw new Error(`ML service responded ${response.status} for ${path}`);
  }
}

const runners = {
  forecast: () => postToML("/forecast/demand/run"),
  marketBasket: () => postToML("/mba/analyze"),
  reorder: () => reorderSuggestionsService.generate(),
  waste: () => wasteReductionService.generate(),
};

export const automationScheduler = {
  _tasks: {},

  /** (Re)load schedules from DB. Keeps last-good schedule on invalid rows. */
  async reschedule() {
    let automation = {};
    try {
      const settings = await settingsRepository.find();
      automation = settings?.automation ?? {};
    } catch (err) {
      console.error("[automation] Failed to load schedules:", err.message);
      return;
    }

    for (const [key, def] of Object.entries(JOB_DEFS)) {
      const job = automation?.[key];
      this._stop(key);

      if (!job?.enabled) continue;

      let expr;
      try {
        expr = toCronExpr(job);
      } catch {
        console.error(`[automation] Invalid schedule for ${key}, skipping`);
        continue;
      }
      if (!cron.validate(expr)) {
        console.error(`[automation] Invalid cron for ${key}: ${expr}, skipping`);
        continue;
      }

      this._tasks[key] = cron.schedule(expr, () => {
        this._run(key).catch((err) =>
          console.error(`[automation] Scheduled ${key} failed:`, err.message),
        );
      });
      console.log(`[automation] Scheduled ${key}: ${expr}`);
    }
  },

  async _run(key) {
    const def = JOB_DEFS[key];
    try {
      await runners[key]();
      console.log(`[automation] Scheduled ${key} complete`);
      auditLogService
        .logAction({
          action: def.audit,
          targetType: def.targetType,
          details: { source: "scheduled" },
        })
        .catch(() => {});
    } catch (err) {
      console.error(`[automation] Scheduled ${key} failed:`, err.message);
      auditLogService
        .logAction({
          action: def.audit,
          targetType: def.targetType,
          details: { source: "scheduled", error: err.message },
        })
        .catch(() => {});
    }
  },

  _stop(key) {
    if (this._tasks[key]) {
      this._tasks[key].stop();
      delete this._tasks[key];
    }
  },
};
