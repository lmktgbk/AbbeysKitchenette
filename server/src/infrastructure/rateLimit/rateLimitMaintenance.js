import { env } from "../../config/env.js";
import { pruneRateLimitBuckets } from "../../middleware/rateLimit.store.js";

/** Prune expired persisted counters without overlapping sweeps; shutdown drains admitted cleanup. */
export function createRateLimitMaintenance({ enabled = env.RATE_LIMIT_STORE === "postgres", prune = pruneRateLimitBuckets, intervalMs = 60000 } = {}) {
  let running = false, timer, flight;
  async function tick() {
    flight = prune().catch(() => console.warn("[rate-limit] Expired counter cleanup deferred"));
    await flight; flight = null;
    if (running) { timer = setTimeout(tick, intervalMs); timer.unref?.(); }
  }
  return {
    start() { if (!enabled || running) return; running = true; void tick(); },
    async stop() { running = false; clearTimeout(timer); await flight; },
  };
}
export const rateLimitMaintenance = createRateLimitMaintenance();
