import { Router } from "express";
import * as database from "../config/prisma.js";
import { fetchMl } from "./mlClient.js";

export function createReadiness({ checkDatabase, checkMl, timeoutMs = 3000, cacheMs = 5000 }) {
  let draining = false;
  let cached;
  let expires = 0;
  let flight;
  const pending = new Map();
  const probe = async (key, check) => {
    // Keep the underlying operation shared even after the response deadline.
    // A stalled dependency must not accumulate work on every health request.
    if (!pending.has(key)) {
      const operation = Promise.resolve().then(check).then(Boolean, () => false);
      pending.set(key, operation);
      operation.finally(() => pending.delete(key));
    }
    let timer;
    try {
      return await Promise.race([pending.get(key), new Promise(resolve => {
        timer = setTimeout(() => resolve(false), timeoutMs);
      })]);
    } finally { clearTimeout(timer); }
  };
  return {
    beginShutdown() { draining = true; },
    isShuttingDown() { return draining; },
    async check() {
      if (draining) return { ready: false, draining: true };
      if (!cached || Date.now() >= expires) {
        flight ??= Promise.all([probe("db", checkDatabase), probe("ml", checkMl)])
          .then(([db, ml]) => {
            cached = { ready: db, checks: { database: db, mlService: ml }, degraded: !ml };
            expires = Date.now() + cacheMs;
          }).finally(() => { flight = undefined; });
        await flight;
      }
      return { ...cached, ready: cached.ready && !draining, draining };
    },
  };
}

export const readiness = createReadiness({
  checkDatabase: async () => {
    await database.databasePool.query({ text: "SELECT 1", query_timeout: 2500 });
    return true;
  },
  checkMl: async () => (await fetchMl("/health", { timeoutMs: 3000 })).ok,
});

export function healthRoutes(probe = readiness) {
  const router = Router();
  router.get("/api/health", (req, res) => res.set("Cache-Control", "no-store").json({
    status: "ok", timestamp: new Date().toISOString(), environment: process.env.NODE_ENV,
  }));
  router.get("/api/ready", async (req, res) => {
    const data = await probe.check();
    res.set("Cache-Control", "no-store").status(data.ready ? 200 : 503).json({
      success: data.ready, message: data.ready ? "Ready" : "Service unavailable",
      error: data.ready ? null : data.draining ? "SHUTTING_DOWN" : "NOT_READY",
      data: { ...data, timestamp: new Date().toISOString() },
    });
  });
  router.use((req, res, next) => probe.isShuttingDown()
    ? res.status(503).set("Connection", "close").json({ success: false, error: "SHUTTING_DOWN", message: "Server is restarting. Please retry shortly." })
    : next());
  return router;
}
