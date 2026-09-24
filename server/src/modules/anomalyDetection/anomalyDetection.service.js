import cron from "node-cron";
import { anomalyRepository } from "./anomalyDetection.repository.js";
import { engine } from "./rules/engine.js";
import { RULE_REGISTRY } from "./rules/index.js";
import { auditLogService } from "../auditLogs/auditLog.service.js";
import { ACTIONS } from "../auditLogs/auditLog.constants.js";
import { notificationService } from "../notifications/notification.service.js";
import { env } from "../../config/env.js";

/**
 * Anomaly Detection Service (BR-12)
 *
 * Two entry modes share runScan: the 6am cron + manual "Check now" pass
 * ruleIds=null (every active rule, always audited), while POS event hooks
 * pass explicit rule ids (deduped, cooldown-guarded, audited only on hits).
 * Only critical/high findings notify — medium/low stay on the page.
 */
export const anomalyService = {
  _cronTask: null,

  startScheduler() {
    const schedule = env.ANOMALY_CRON_SCHEDULE;
    if (!cron.validate(schedule)) {
      console.error("[anomaly] Invalid cron schedule:", schedule);
      return;
    }
    this._cronTask = cron.schedule(schedule, () => {
      this.runScan().catch((err) => console.error("[anomaly] Scheduled scan failed:", err.message));
    });
    console.log(`[anomaly] Scheduler started: ${schedule}`);
  },

  stopScheduler() {
    if (this._cronTask) {
      this._cronTask.stop();
      this._cronTask = null;
    }
  },

  _lastFired: new Map(),

  async runScan(ruleIds = null) {
    const startTime = Date.now();
    const allResults = [];
    const now = Date.now();
    const COOLDOWN_MS = 15 * 60 * 1000;

    for (const rule of RULE_REGISTRY) {
      if (!rule.enabled) continue;
      if (ruleIds && !ruleIds.includes(rule.id)) continue;
      // 15-min cooldown per rule for real-time hooks
      if (ruleIds) {
        const last = this._lastFired.get(rule.id) || 0;
        if (now - last < COOLDOWN_MS) continue;
      }
      try {
        // Dedup-first: skip before aggregation + Gemini when an active card exists today
        const dupExists = await anomalyRepository.existsActiveToday(rule.id);
        if (dupExists) continue;
        const result = await engine.evaluate(rule);
        if (result) {
          // Supplier quiet: skip if reviewed same ingredient+price already acknowledged
          if (rule.id === "supplier_price_jump" && result.ingredientId) {
            const reviewed = await anomalyRepository.existsReviewedSupplier(result.ingredientId, String(result.actualValue));
            if (reviewed) continue;
          }
          allResults.push(result);
          if (ruleIds) this._lastFired.set(rule.id, now);
        }
      } catch (err) {
        console.error(`[anomaly] Rule "${rule.id}" failed:`, err.message);
      }
    }

    if (allResults.length > 0) {
      await anomalyRepository.createMany(allResults);

      for (const result of allResults) {
        if (result.severity === "critical" || result.severity === "high") {
          notificationService.create({
            type: "system",
            title: `Anomaly: ${result.title}`,
            message: result.description,
            referenceType: "anomaly",
            referenceId: result.id,
          }).catch(() => {});
        }
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[anomaly] Scan complete: ${allResults.length} anomalies found in ${elapsed}s`);

    // Noise throttle: hook-triggered scans (ruleIds set by POS events) audit
    // only when they actually find something. Manual Check now + 6am cron
    // (ruleIds null) always leave a trail.
    if (allResults.length > 0 || !ruleIds) {
      auditLogService.logAction({
        action: ACTIONS.ANOMALY_SCAN,
        targetType: "anomaly",
        details: { anomaliesFound: allResults.length, elapsedSeconds: Number(elapsed) },
      }).catch(() => {});
    }

    return { anomaliesFound: allResults.length, elapsedSeconds: Number(elapsed) };
  },

  async getResults(params) {
    return anomalyRepository.findMany(params);
  },

  async getActive(severities) {
    return anomalyRepository.findActive(severities);
  },

  async getStats() {
    return anomalyRepository.getStats();
  },

  async acknowledge(id) {
    return anomalyRepository.acknowledge(id);
  },

  async cleanup(days = 90) {
    const result = await anomalyRepository.deleteOlderThan(days);
    return { deleted: result.count };
  },
};
