import cloudinary from "../../config/cloudinary.js";
import { env } from "../../config/env.js";
import { storageRepository } from "./storage.repository.js";

/** Reconcile persisted cleanup claims; provider failures remain eligible for repository-managed retries. */
export function createStorageWorker({ repository = storageRepository, destroy = id => cloudinary.uploader.destroy(id,
  { resource_type: "image", invalidate: true, timeout: 30000 }), enabled = Boolean(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET), intervalMs = 60000, destroyTimeoutMs = 31000 } = {}) {
  let running = false, timer, flight, requested = false;
  /** Process at most ten due assets; the repository decides whether references permit deletion. */
  async function sweep() {
    for (let i = 0; i < 10 && running; i++) {
      const asset = await repository.claim(); if (!asset) break;
      if (asset.blocked || asset.retained) continue;
      let success = false;
      let deadline;
      try {
        const response = await Promise.race([Promise.resolve().then(() => destroy(asset.public_id)), new Promise((_, reject) => {
          deadline = setTimeout(() => reject(Error("Storage timeout")), destroyTimeoutMs); deadline.unref?.();
        })]);
        // Missing remote assets count as successful cleanup. Unknown responses
        // stay retryable; a timed-out provider call may still have taken effect.
        success = ['ok', 'not found'].includes(response?.result);
      } catch { /* Durable retry retains the deletion fence, including uncertain provider outcomes. */ }
      finally { clearTimeout(deadline); }
      await repository.finish(asset, success);
    }
  }
  /** Coalesce wake requests during a sweep and schedule one follow-up without overlapping provider calls. */
  function wake() {
    if (!running) return;
    if (flight) { requested = true; return; }
    clearTimeout(timer);
    flight = sweep().catch(() => console.warn("[storage] Asset reconciliation deferred")).finally(() => {
      flight = null;
      if (running) { timer = setTimeout(wake, requested ? 0 : intervalMs); timer.unref?.(); }
      requested = false;
    });
  }
  return { wake, start() { if (!enabled || running) return; running = true; wake(); },
    async stop() { running = false; clearTimeout(timer); await flight; } };
}
export const storageWorker = createStorageWorker();
