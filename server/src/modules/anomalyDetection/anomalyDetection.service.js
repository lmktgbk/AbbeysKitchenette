import cron from "node-cron";
import { anomalyRepository } from "./anomalyDetection.repository.js";
import { engine } from "./rules/engine.js";
import { RULE_REGISTRY } from "./rules/index.js";
import { auditLogService } from "../auditLogs/auditLog.service.js";
import { ACTIONS } from "../auditLogs/auditLog.constants.js";
import { notificationService } from "../notifications/notification.service.js";
import { env } from "../../config/env.js";

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

  async runScan() {
    const startTime = Date.now();
    const allResults = [];

    for (const rule of RULE_REGISTRY) {
      if (!rule.enabled) continue;
      try {
        const result = await engine.evaluate(rule);
        if (result) allResults.push(result);
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

    auditLogService.logAction({
      action: ACTIONS.ANOMALY_SCAN,
      targetType: "anomaly",
      details: { anomaliesFound: allResults.length, elapsedSeconds: Number(elapsed) },
    }).catch(() => {});

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
