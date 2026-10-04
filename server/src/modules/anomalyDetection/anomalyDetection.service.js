import cron from "node-cron";
import { anomalyRepository } from "./anomalyDetection.repository.js";
import { engine } from "./rules/engine.js";
import { RULE_REGISTRY } from "./rules/index.js";
import prisma from "../../config/prisma.js";
import crypto from "node:crypto";
import { recordEffects } from "../../services/domainEffects.js";
import { AppError } from "../../middleware/errorHandler.middleware.js";
import { ACTIONS } from "../auditLogs/auditLog.constants.js";
import { env } from "../../config/env.js";
import { BUSINESS_TZ } from "../../config/time.js";
import { emitAnomalyCompleted } from "../../realtime/events.js";

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
    // Pinned to the Manila business wall-clock regardless of host tz.
    this._cronTask = cron.schedule(schedule, () => {
      this.runScan().catch((err) => console.error("[anomaly] Scheduled scan failed:", err.message));
    }, { timezone: BUSINESS_TZ });
    console.log(`[anomaly] Scheduler started: ${schedule} (${BUSINESS_TZ})`);
  },

  stopScheduler() {
    if (this._cronTask) {
      this._cronTask.stop();
      this._cronTask = null;
    }
  },

  _lastFired: new Map(),

  async runScan(ruleIds = null, context = null, userId) {
    const startTime = Date.now();
    const allResults = [];
    const now = Date.now();
    const COOLDOWN_MS = 15 * 60 * 1000;

    for (const rule of RULE_REGISTRY) {
      if (!rule.enabled) continue;
      if (ruleIds && !ruleIds.includes(rule.id)) continue;
      // Cash drawer is policeman (per-shift) — no 15-min cooldown so back-
      // to-back closes each flag. Other hook rules keep the throttle.
      if (ruleIds && rule.id !== "shift_variance_spike") {
        const last = this._lastFired.get(rule.id) || 0;
        if (now - last < COOLDOWN_MS) continue;
      }
      // Policeman path: flag the exact shift(s), one card per shift.
      if (rule.id === "shift_variance_spike") {
        try {
          const flagged = await this._runShiftVariancePoliceman(rule, context);
          for (const r of flagged) {
            allResults.push(r);
          }
        } catch (err) {
          console.error(`[anomaly] Rule "${rule.id}" failed:`, err.message);
        }
        continue;
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
        }
      } catch (err) {
        console.error(`[anomaly] Rule "${rule.id}" failed:`, err.message);
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const saved = allResults.map(result => ({ ...result, id: crypto.randomUUID() }));
    await prisma.$transaction(async tx => {
      if (saved.length) await anomalyRepository.createMany(saved, tx);
      await recordEffects(tx, {
        audit: { userId, action: ACTIONS.ANOMALY_SCAN, targetType: "anomaly",
          details: { anomaliesFound: saved.length, elapsedSeconds: Number(elapsed), rules: ruleIds ?? "all" } },
        notifications: saved.filter(r => ["critical", "high"].includes(r.severity)).map(result => ({
          type: "system", title: `Anomaly: ${result.title}`.slice(0, 200), message: result.description,
          referenceType: "anomaly", referenceId: result.id,
        })),
      });
    }, { timeout: 5000 });
    if (ruleIds) for (const result of saved) this._lastFired.set(result.ruleId, now);
    console.log(`[anomaly] Scan complete: ${saved.length} anomalies found in ${elapsed}s`);

    // Refresh anomaly screens immediately; durable audit delivery runs independently.
    emitAnomalyCompleted(allResults.length);

    // Retention: findings older than 90 days are pruned on every scan.
    // Cheap indexed delete, idempotent — this is the only pruning path
    // now that no scheduler runs (previously nothing ever called cleanup).
    anomalyRepository.deleteOlderThan(90).catch((err) =>
      console.warn("[anomaly] retention prune dropped:", err?.message),
    );

    return { anomaliesFound: allResults.length, elapsedSeconds: Number(elapsed) };
  },

  // Policeman runner for cash drawer: hook context flags one shift,
  // manual/cron fans out over today's unalarmed mismatched closes (max 5).
  async _runShiftVariancePoliceman(rule, context) {
    const out = [];
    const evaluateOne = async (shift) => {
      if (!shift?.shiftId || Number(shift.variance ?? 0) === 0) return;
      if (await anomalyRepository.existsShiftCard(shift.shiftId)) return;
      rule._pendingShift = shift;
      try {
        const result = await engine.evaluate(rule);
        if (result) {
          if (rule.id === "supplier_price_jump" && result.ingredientId) {
            const reviewed = await anomalyRepository.existsReviewedSupplier(result.ingredientId, String(result.actualValue));
            if (reviewed) return;
          }
          out.push(result);
        }
      } finally {
        rule._pendingShift = null;
      }
    };
    // Hook path: closeShift passes { shift: { shiftId, expected, actual, variance } }.
    if (context?.shift?.shiftId) {
      await evaluateOne(context.shift);
      return out;
    }
    // Manual/cron path: sweep today's mismatched closes.
    const data = await rule.dataFetcher.call({ _pendingShift: null, config: rule.config });
    const candidates = data?.candidates ?? [];
    for (const shift of candidates.slice(0, 5)) {
      await evaluateOne(shift);
    }
    return out;
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

  async acknowledge(id, userId) {
    const result = await prisma.$transaction(async tx => {
      const claimed = await anomalyRepository.acknowledge(id, tx);
      const row = await tx.anomalyResult.findUnique({ where: { id } });
      if (!row) throw new AppError(404, "Anomaly not found", "ANOMALY_NOT_FOUND");
      if (claimed.count) await recordEffects(tx, { audit: { userId, action: ACTIONS.ANOMALY_ACKNOWLEDGED,
        targetType: "anomaly", targetId: id } });
      return row;
    }, { timeout: 5000 });
    emitAnomalyCompleted(null);
    return result;
  },

  async cleanup(days = 90) {
    const result = await anomalyRepository.deleteOlderThan(days);
    return { deleted: result.count };
  },
};
