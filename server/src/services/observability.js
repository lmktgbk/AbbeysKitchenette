import crypto from "node:crypto";
import { performance } from "node:perf_hooks";
import { Router } from "express";
import { databasePool } from "../config/prisma.js";
import authenticate from "../middleware/authenticate.middleware.js";
import authorize from "../middleware/authorize.middleware.js";

export function createRequestTelemetry({ write = line => console.log(line), now = () => performance.now() } = {}) {
  const routes = new Map();
  return {
    middleware(req, res, next) {
      const start = now(); req.requestId = crypto.randomUUID(); res.setHeader("X-Request-ID", req.requestId);
      res.once("finish", () => {
        // Route templates exclude customer IDs, query strings and submitted secrets.
        const route = typeof req.route?.path === "string" ? `${req.baseUrl ?? ""}${req.route.path}` : "unmatched";
        const label = `${req.method} ${route}`, key = routes.has(label) || routes.size < 256 ? label : "other";
        const durationMs = Math.max(0, now() - start), previous = routes.get(key) ?? { requests: 0, errors: 0, authFailures: 0, totalMs: 0, maxMs: 0 };
        previous.requests++; previous.errors += Number(res.statusCode >= 500);
        previous.authFailures += Number([401, 403].includes(res.statusCode));
        previous.totalMs += durationMs; previous.maxMs = Math.max(previous.maxMs, durationMs); routes.set(key, previous);
        write(JSON.stringify({ timestamp: new Date().toISOString(), event: "http_request", requestId: req.requestId,
          method: req.method, route, status: res.statusCode, durationMs: Math.round(durationMs) }));
      });
      next();
    },
    snapshot() { return Array.from(routes, ([route, data]) => ({ route, ...data, averageMs: Math.round(data.totalMs / data.requests) })); },
  };
}

export function createQueueSnapshot({ query = options => databasePool.query(options), cacheMs = 10000 } = {}) {
  let cached, expires = 0, flight;
  return async () => {
    if (cached && Date.now() < expires) return cached;
    flight ??= query({ query_timeout: 2500, text: `
      SELECT 'effects' AS component, state AS status, COUNT(*)::int AS count, MIN(created_at) AS oldest FROM domain_effects WHERE state <> 'delivered' GROUP BY state
      UNION ALL SELECT 'automation', status, COUNT(*)::int, MIN(created_at) FROM automation_runs WHERE status IN ('pending','running','blocked','submitted') GROUP BY status
      UNION ALL SELECT 'storage', state, COUNT(*)::int, MIN(created_at) FROM storage_assets WHERE state NOT IN ('attached','deleted') GROUP BY state
      UNION ALL SELECT 'availability', 'pending', COUNT(*)::int, MIN(queued_at) FROM availability_repairs
    ` }).then(result => { cached = result.rows; expires = Date.now() + cacheMs; return cached; }).finally(() => { flight = undefined; });
    return flight;
  };
}
export const requestTelemetry = createRequestTelemetry({ write: line => {
  if (process.env.NODE_ENV === "production") console.log(line);
} });
export function operationsRoutes({ telemetry = requestTelemetry, queues = createQueueSnapshot() } = {}) {
  const router = Router();
  router.get("/metrics", authenticate, authorize("admin"), async (req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      res.json({ success: true, data: { uptimeSeconds: Math.round(process.uptime()), memory: process.memoryUsage(),
        cpu: process.cpuUsage(), http: telemetry.snapshot(), queues: await queues() } });
    } catch {
      res.status(503).json({ success: false, error: "METRICS_UNAVAILABLE", message: "Operational storage unavailable", data: null });
    }
  });
  return router;
}
