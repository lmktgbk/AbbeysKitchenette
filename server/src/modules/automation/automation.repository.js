import { recordEffects } from "../../infrastructure/effects/effects.js";
import { ACTIONS } from "../auditLogs/auditLog.constants.js";
import { randomUUID } from "node:crypto";
import prisma from "../../config/prisma.js";

const KEY = "automation:worker";
// These generators publish results and completion atomically; SMTP/ML admission cannot offer that guarantee.
const SAFE = ["reorder", "waste"];
export const automationRepository = {
  async settings() {
    const [row] =
      await prisma.$queryRaw`SELECT automation, clock_timestamp() AS now FROM system_settings WHERE id = 1`;
    return row;
  },
  async enqueue(runs) {
    if (runs.length)
      await prisma.automationRun.createMany({
        data: runs,
        skipDuplicates: true,
      });
  },
  async pauseDisabled(automation) {
    const enabled = [
      "forecast",
      "marketBasket",
      "reorder",
      "waste",
      "dailyReport",
    ].filter((kind) => automation?.[kind]?.enabled === true);
    await prisma.$executeRaw`UPDATE automation_runs SET status = 'blocked', last_error = 'SCHEDULE_DISABLED',
      updated_at = clock_timestamp() WHERE status = 'pending' AND kind <> 'anomaly' AND NOT (kind = ANY(${enabled}::text[]))`;
  },
  async refreshSubmitted() {
    // Admission acknowledgement is not job completion. Reconcile the saved ML
    // job ID against the worker's durable state without submitting another job.
    for (const [kind, table] of [
      ["forecast", "forecast_jobs"],
      ["marketBasket", "mba_jobs"],
    ]) {
      const sql = `UPDATE automation_runs AS run SET status = CASE WHEN job.status = 'completed' THEN 'succeeded' ELSE 'blocked' END,
        last_error = CASE WHEN job.status = 'failed' THEN 'ML_WORKER_FAILED' ELSE NULL END,
        updated_at = clock_timestamp() FROM ${table} AS job
        WHERE run.kind = $1 AND run.status = 'submitted' AND (run.result->>'jobId')::integer = job.id
          AND job.status IN ('completed','failed')`;
      await prisma.$executeRawUnsafe(sql, kind);
    }
  },
  /** Acquire the worker gate and one pending run using DB-clock leases; exclude separately owned anomaly jobs. */
  async claim() {
    const owner = randomUUID();
    return prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`INSERT INTO background_leases (key) VALUES (${KEY}) ON CONFLICT DO NOTHING`;
        const gate =
          await tx.$queryRaw`UPDATE background_leases SET owner = ${owner}::uuid,
        expires_at = clock_timestamp() + interval '5 minutes'
        WHERE key = ${KEY} AND (expires_at IS NULL OR expires_at <= clock_timestamp()) RETURNING key`;
        if (!gate.length) return null;
        // Advisory results commit with their terminal run state. External sends do
        // not provide that guarantee; expired ownership therefore requires review.
        await tx.$executeRaw`UPDATE automation_runs SET
        status = CASE WHEN kind IN ('reorder','waste') AND attempts < 3 THEN 'pending' ELSE 'blocked' END,
        last_error = CASE WHEN kind IN ('reorder','waste') THEN 'WORKER_EXPIRED' ELSE 'EXTERNAL_OUTCOME_UNKNOWN' END,
        owner = NULL, lease_expires_at = NULL, updated_at = clock_timestamp()
        WHERE kind <> 'anomaly' AND status = 'running' AND lease_expires_at <= clock_timestamp()`;
        const [run] = await tx.$queryRaw`WITH candidate AS (
        SELECT run_key FROM automation_runs WHERE kind <> 'anomaly' AND status = 'pending' AND next_attempt_at <= clock_timestamp()
          AND EXISTS (SELECT 1 FROM system_settings WHERE id = 1 AND automation->kind->>'enabled' = 'true')
        ORDER BY scheduled_at, run_key FOR UPDATE SKIP LOCKED LIMIT 1
      ) UPDATE automation_runs AS run SET status = 'running', owner = ${owner}::uuid,
        lease_expires_at = clock_timestamp() + interval '5 minutes', attempts = attempts + 1,
        updated_at = clock_timestamp() FROM candidate WHERE run.run_key = candidate.run_key
        RETURNING run.run_key AS "runKey", run.kind, run.scheduled_at AS "scheduledAt", run.attempts`;
        if (!run)
          await tx.$executeRaw`UPDATE background_leases SET owner = NULL, expires_at = NULL WHERE key = ${KEY} AND owner = ${owner}::uuid`;
        return run ? { ...run, owner } : null;
      },
      { timeout: 5000 },
    );
  },
  async owns(run) {
    const rows =
      await prisma.$queryRaw`SELECT run_key FROM automation_runs WHERE run_key = ${run.runKey}
      AND owner = ${run.owner}::uuid AND status = 'running' AND lease_expires_at > clock_timestamp()`;
    return rows.length === 1;
  },
  /** Extend both gate and run leases only for the current unexpired owner; false means stop side effects. */
  async renew(run) {
    return prisma.$transaction(
      async (tx) => {
        const gate =
          await tx.$executeRaw`UPDATE background_leases SET expires_at = clock_timestamp() + interval '5 minutes'
        WHERE key = ${KEY} AND owner = ${run.owner}::uuid AND expires_at > clock_timestamp()`;
        if (!gate) return false;
        const renewed =
          await tx.$executeRaw`UPDATE automation_runs SET lease_expires_at = clock_timestamp() + interval '5 minutes'
        WHERE run_key = ${run.runKey} AND owner = ${run.owner}::uuid AND status = 'running' AND lease_expires_at > clock_timestamp()`;
        return renewed === 1;
      },
      { timeout: 5000 },
    );
  },
  /** Fence terminal state and audit with the caller's results transaction, or create a short transaction. */
  async complete(run, { status = "succeeded", result = null } = {}, tx) {
    if (!tx)
      return prisma.$transaction(
        (client) => this.complete(run, { status, result }, client),
        { timeout: 5000 },
      );
    const updated =
      await tx.$executeRaw`UPDATE automation_runs SET status = ${status}, result = ${JSON.stringify(result)}::jsonb,
      owner = NULL, lease_expires_at = NULL, last_error = NULL, updated_at = clock_timestamp()
      WHERE run_key = ${run.runKey} AND owner = ${run.owner}::uuid AND status = 'running'
        AND lease_expires_at > clock_timestamp()`;
    if (updated !== 1) throw new Error("AUTOMATION_LEASE_LOST");
    const actions = {
      forecast: ACTIONS.FORECAST_RUN,
      marketBasket: ACTIONS.MBA_RUN,
      reorder: ACTIONS.REORDER_RUN,
      waste: ACTIONS.WASTE_RUN,
    };
    await recordEffects(tx, {
      audit: {
        action: actions[run.kind] ?? ACTIONS.AUTOMATION_COMPLETED,
        targetType: "automation",
        details: { source: "scheduled", runKey: run.runKey, status, result },
      },
    });
  },
  /** Retry only atomic generators within budget; uncertain external outcomes are blocked for review. */
  async fail(run) {
    const retry = SAFE.includes(run.kind) && run.attempts < 3;
    return prisma.$executeRaw`UPDATE automation_runs SET status = ${retry ? "pending" : "blocked"},
      next_attempt_at = clock_timestamp() + ${60000 * run.attempts} * interval '1 millisecond',
      last_error = ${SAFE.includes(run.kind) ? "GENERATION_FAILED" : "EXTERNAL_OUTCOME_UNKNOWN"},
      owner = NULL, lease_expires_at = NULL, updated_at = clock_timestamp()
      WHERE run_key = ${run.runKey} AND owner = ${run.owner}::uuid AND status = 'running'
        AND lease_expires_at > clock_timestamp()`;
  },
  async release(run) {
    await prisma.$executeRaw`UPDATE background_leases SET owner = NULL, expires_at = NULL
      WHERE key = ${KEY} AND owner = ${run.owner}::uuid`;
  },
};
