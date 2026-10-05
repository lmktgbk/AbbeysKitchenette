import { effectsRepository } from "./effects.repository.js";
import { broadcast } from "../realtime/hub.js";

/** Recover saved effects in bounded sweeps; stop waits for the current sweep before shutdown. */
export function createEffectsWorker({ repository = effectsRepository, emit = broadcast, intervalMs = 5000 } = {}) {
  let running = false, timer, flight, lastPrune = 0;
  /** Deliver up to twenty intents, then repair availability and periodically prune delivered history. */
  async function sweep() {
    for (let i = 0; i < 20 && running; i++) {
      const result = await repository.deliverOne();
      if (!result) break;
      // Database delivery is durable. Socket invalidations remain best-effort;
      // reconnect/refetch reads committed records and does not replay business writes.
      try {
        if (result.audit) emit("audit", { entity: "audit-log" });
        if (result.notifications) emit("notifications:all", { entity: "notification" });
      } catch { /* Readers reconcile from the database on reconnect. */ }
    }
    if (running && await repository.repairAvailability()) {
      try { emit("products", { entity: "menu" }); } catch { /* Menu refresh reads repaired state. */ }
    }
    if (running && Date.now() - lastPrune > 3600000) { await repository.prune(); lastPrune = Date.now(); }
  }
  /** Start one sweep per process; the next timer is armed only after it settles. */
  function wake() {
    if (!running || flight) return;
    clearTimeout(timer);
    flight = sweep().catch(() => console.warn("[effects] Durable follow-up recovery deferred")).finally(() => {
      flight = null;
      if (running) { timer = setTimeout(wake, intervalMs); timer.unref?.(); }
    });
  }
  return { start() { if (running) return; running = true; wake(); }, wake,
    async stop() { running = false; clearTimeout(timer); await flight; } };
}
export const effectsWorker = createEffectsWorker();
