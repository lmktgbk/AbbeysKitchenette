/**
 * Job Watchers — server-side progress polling for ML jobs (Phase 3).
 *
 * WHY it exists: forecasting/MBA jobs run minutes on the Python service
 * while clients used to poll every 2s each. Exactly ONE 2s poller per
 * ACTIVE job lives here (never per client, never when idle); on terminal
 * state it broadcasts `jobs:<jobId>` and stops itself. Clients subscribe
 * the job topic and refetch through existing status hooks — same completion
 * flow as polling, zero client timers.
 *
 * Watchers arm lazily: status routes call proxyMlStatus(), which arms a
 * watcher whenever it serves a non-terminal status. Server restarts are
 * safe — the next status fetch re-arms. Stale watchers self-terminate
 * (MAX_WATCH_MS) with a final broadcast so no client waits forever.
 */

import { broadcast } from "./hub.js";

const PYTHON_URL = process.env.FORECAST_URL || "http://localhost:8000";
const POLL_MS = 2000;
const MAX_WATCH_MS = 30 * 60 * 1000;

const TERMINAL_FORECAST = new Set(["completed", "failed", "not_found"]);

const watchers = new Map(); // `${kind}:${jobId}` -> { timer, startedAt }

function isTerminal(kind, status) {
  if (kind === "forecast") return TERMINAL_FORECAST.has(status);
  // MBA client polls only while status === "running"; anything else stops it.
  return status != null && status !== "running";
}

async function fetchMlStatus(kind, jobId) {
  const path = kind === "forecast"
    ? `/forecast/demand/status?job_id=${jobId}`
    : `/mba/jobs/${jobId}`;
  const response = await fetch(`${PYTHON_URL}${path}`);
  if (!response.ok) return null;
  const data = await response.json().catch(() => null);
  return data?.status ?? null;
}

function finish(key, jobId) {
  const entry = watchers.get(key);
  if (entry) {
    clearInterval(entry.timer);
    watchers.delete(key);
  }
  broadcast(`jobs:${jobId}`, { entity: "job", id: String(jobId) });
}

/**
 * Ensure exactly one watcher for an active job. No-op when one exists.
 * @param {"forecast"|"mba"} kind
 * @param {string|number} jobId
 */
export function ensureJobWatcher(kind, jobId) {
  if (jobId == null || jobId === "") return;
  const key = `${kind}:${jobId}`;
  if (watchers.has(key)) return;
  const startedAt = Date.now();
  const tick = async () => {
    try {
      const status = await fetchMlStatus(kind, jobId);
      if (isTerminal(kind, status) || Date.now() - startedAt > MAX_WATCH_MS) {
        finish(key, jobId);
      }
    } catch (err) { console.warn("[realtime] job watch tick dropped:", key, err?.message); }
  };
  const timer = setInterval(tick, POLL_MS);
  timer.unref?.();
  watchers.set(key, { timer, startedAt });
  tick();
}

/**
 * Proxy an ML status fetch to Express res (same envelope as the local
 * proxyGet helpers) and arm a watcher when the job is still running.
 */
export async function proxyMlStatus(res, { kind, jobId, mlPath, okMessage, serviceLabel, fallbackCode }) {
  try {
    const response = await fetch(`${PYTHON_URL}${mlPath}`);
    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        message: `${serviceLabel} service error: ${response.status}`,
        error: fallbackCode,
        data: null,
      });
    }
    const data = await response.json();
    if (!isTerminal(kind, data?.status)) ensureJobWatcher(kind, jobId);
    return res.status(200).json({ success: true, message: okMessage, data });
  } catch (error) {
    console.error(`[${fallbackCode}] ${serviceLabel} service unavailable:`, error.message);
    return res.status(503).json({
      success: false,
      message: `${serviceLabel} service is temporarily unavailable. Please try again later.`,
      error: `${serviceLabel.toUpperCase()}_SERVICE_UNAVAILABLE`,
      data: null,
    });
  }
}

/** Test-only: watcher census + reset. */
export function watcherStats() {
  return [...watchers.keys()];
}

/** Test-only: stop all watchers. */
export function __resetWatchers() {
  for (const key of [...watchers.keys()]) {
    clearInterval(watchers.get(key).timer);
    watchers.delete(key);
  }
}
