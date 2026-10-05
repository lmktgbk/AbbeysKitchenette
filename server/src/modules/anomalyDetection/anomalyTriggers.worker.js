import crypto from "node:crypto";
import prisma from "../../config/prisma.js";
import { anomalyService } from "./anomalyDetection.service.js";

/** Recover durable scan triggers with expiring ownership; publish only while the claimed owner remains valid. */
export function createAnomalyWorker({ db = prisma, scan = (...args) => anomalyService.runScan(...args), intervalMs = 5000 } = {}) {
  let running = false, timer, flight;
  /** Recover expired claims within the attempt budget, then claim one due trigger using DB-clock ownership. */
  async function sweep() {
    const owner = crypto.randomUUID();
    const run = await db.$transaction(async tx => {
      await tx.$executeRaw`UPDATE automation_runs SET status = CASE WHEN attempts < 6 THEN 'pending' ELSE 'blocked' END,
        owner = NULL, lease_expires_at = NULL, last_error = 'ANOMALY_WORKER_EXPIRED'
        WHERE kind = 'anomaly' AND status = 'running' AND lease_expires_at <= clock_timestamp()`;
      // SKIP LOCKED lets another replica take a different trigger; the fresh
      // owner UUID prevents an expired worker from acknowledging this claim.
      const [row] = await tx.$queryRaw`WITH candidate AS (
        SELECT run_key FROM automation_runs WHERE kind = 'anomaly' AND status = 'pending' AND next_attempt_at <= clock_timestamp()
        ORDER BY scheduled_at, run_key FOR UPDATE SKIP LOCKED LIMIT 1
      ) UPDATE automation_runs r SET status = 'running', owner = ${owner}::uuid, attempts = attempts + 1,
        lease_expires_at = clock_timestamp() + interval '5 minutes', updated_at = clock_timestamp()
        FROM candidate WHERE r.run_key = candidate.run_key RETURNING r.run_key AS "runKey", r.result, r.attempts`;
      return row;
    }, { timeout: 5000 });
    if (!run) return;
    try {
      // Evaluation is outside a transaction. Publication fences the lease and
      // completes this run in the same commit as findings and their audit.
      await scan(run.result.rules, run.result.context, undefined, { runKey: run.runKey, owner });
    } catch {
      await db.$executeRaw`UPDATE automation_runs SET status = CASE WHEN attempts < 6 THEN 'pending' ELSE 'blocked' END,
        next_attempt_at = clock_timestamp() + interval '30 seconds', owner = NULL, lease_expires_at = NULL,
        last_error = 'ANOMALY_SCAN_FAILED', updated_at = clock_timestamp()
        WHERE run_key = ${run.runKey} AND owner = ${owner}::uuid AND status = 'running'`;
      console.warn("[anomaly] Durable scan deferred");
    }
  }
  /** Prevent local scan overlap and poll again after either success or recoverable storage failure. */
  function wake() {
    if (!running || flight) return;
    flight = sweep().catch(() => console.warn("[anomaly] Trigger storage unavailable")).finally(() => {
      flight = null; if (running) { timer = setTimeout(wake, intervalMs); timer.unref?.(); }
    });
  }
  return { start() { if (running) return; running = true; wake(); }, async stop() { running = false; clearTimeout(timer); await flight; } };
}
export const anomalyWorker = createAnomalyWorker();
