import cron from "node-cron";
import { anomalyRepository } from "./anomalyDetection.repository.js";
import { engine } from "./rules/engine.js";
import { RULE_REGISTRY } from "./rules/index.js";
import prisma from "../../config/prisma.js";
import crypto from "node:crypto";
import { recordEffects } from "../../infrastructure/effects/effects.js";
import { AppError } from "../../middleware/errorHandler.middleware.js";
import { ACTIONS } from "../auditLogs/auditLog.constants.js";
import { env } from "../../config/env.js";
import { BUSINESS_TZ } from "../../config/time.js";
import { emitAnomalyCompleted } from "../../infrastructure/realtime/events.js";

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

  async runScan(ruleIds = null, context = null, userId, trigger) {
    const startTime = Date.now();
    const allResults = [];
    const now = Date.now();
    const COOLDOWN_MS = 15 * 60 * 1000;

    let evaluationFailed = false;
    for (const definition of RULE_REGISTRY) {
      // Rule methods use this._lastData/_pendingShift; each evaluation owns
      // its own object so concurrent scans cannot exchange cashier context.
      const rule = { ...definition, config: { ...definition.config } };
      if (!rule.enabled) continue;
      if (ruleIds && !ruleIds.includes(rule.id)) continue;
      // Each closed shift has its own finding. Do not throttle consecutive
      // shift closes; other triggered rules retain the in-process cooldown.
      // The transaction below provides cross-instance duplicate protection.
      if (ruleIds && rule.id !== "shift_variance_spike") {
        const last = this._lastFired.get(rule.id) || 0;
        if (now - last < COOLDOWN_MS) continue;
      }
      // Evaluate the supplied shift or the bounded sweep, with one card per shift.
      if (rule.id === "shift_variance_spike") {
        try {
          const flagged = await this._runShiftVariancePoliceman(rule, context);
          for (const r of flagged) {
            allResults.push(r);
          }
        } catch {
          evaluationFailed = true;
          console.error(`[anomaly] Rule "${rule.id}" evaluation failed`);
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
      } catch {
        evaluationFailed = true;
        console.error(`[anomaly] Rule "${rule.id}" evaluation failed`);
      }
    }

    // Durable triggers retry an incomplete evaluation rather than acknowledge
    // partial results. Manual scans retain their existing best-effort behavior.
    if (trigger && evaluationFailed) throw Error("ANOMALY_EVALUATION_FAILED");
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const saved = [];
    await prisma.$transaction(async tx => {
      // Evaluation may overlap, but the final dedup check and publication
      // share this short transaction lock across backend instances.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(73423, 1)`;
      if (trigger) {
        const claimed = await tx.$executeRaw`UPDATE automation_runs SET status = 'succeeded', owner = NULL,
          lease_expires_at = NULL, last_error = NULL, updated_at = clock_timestamp()
          WHERE run_key = ${trigger.runKey} AND owner = ${trigger.owner}::uuid AND kind = 'anomaly'
            AND status = 'running' AND lease_expires_at > clock_timestamp()`;
        if (claimed !== 1) throw Error("ANOMALY_LEASE_LOST");
      }
      for (const result of allResults) {
        const shiftId = result.ruleId === "shift_variance_spike" ? result.description.match(/\[([a-f0-9-]{36})\]/i)?.[1] : null;
        const duplicate = shiftId ? await anomalyRepository.existsShiftCard(shiftId, tx)
          : await anomalyRepository.existsActiveToday(result.ruleId, tx);
        if (duplicate) continue;
        // ingredientId is evaluation metadata, not an anomaly_results column.
        const { ingredientId: _ingredientId, ...data } = result;
        saved.push({ ...data, id: crypto.randomUUID() });
      }
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
    emitAnomalyCompleted(saved.length);

    // Retention: findings older than 90 days are pruned on every scan.
    // Cheap indexed delete, idempotent — this is the only pruning path
    // now that no scheduler runs (previously nothing ever called cleanup).
    anomalyRepository.deleteOlderThan(90).catch((err) =>
      console.warn("[anomaly] retention prune dropped:", err?.message),
    );

    return { anomaliesFound: saved.length, elapsedSeconds: Number(elapsed) };
  },

  /** Evaluate the exact closed shift, or at most five unreported mismatched closes from today. */
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
