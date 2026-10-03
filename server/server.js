/**
 * Server Entry Point
 * Validates required .env and loads .env
 * Pre-flights the database, then starts express server
 */

// Pin host-local clock reads to the business zone (defense in depth —
// business dating itself comes from the DB clock via config/time.js).
// NOTE: ESM evaluates imports first; set TZ=Asia/Manila in the deploy
// environment for full effect (see .env.example).
if (!process.env.TZ) process.env.TZ = "Asia/Manila";

import http from "http";
import app from "./src/app.js";
import { readiness } from "./src/services/readiness.js";
import { createShutdown } from "./src/services/shutdown.js";
import { rateLimitMaintenance } from "./src/services/rateLimitMaintenance.js";
import { env } from "./src/config/env.js";
import prisma from "./src/config/prisma.js";
import { automationScheduler } from "./src/modules/automation/automation.scheduler.js";
import { sheetsService } from "./src/modules/sheets/sheets.service.js";
import { attachRealtimeServer } from "./src/realtime/server.js";

let httpServer = null;
let realtime = null;

async function boot() {
  // Fail fast when the database is unreachable — never serve a dead API.
  try {
    if (!(await readiness.check()).ready) throw new Error("Database readiness failed");
  } catch (err) {
    console.error("[boot] Database unreachable:", err.message);
    process.exit(1);
  }

  if (readiness.isShuttingDown()) return;
  // Plain http server (not app.listen) so Express + WebSocket share one port.
  httpServer = http.createServer(app);
  realtime = attachRealtimeServer(httpServer);

  httpServer.listen(env.PORT, () => {
    if (readiness.isShuttingDown()) return;
    console.log(
      `Server running in ${env.NODE_ENV} mode on http://localhost:${env.PORT}`,
    );

    // Anomaly detection is purely event-driven (POS/shift/loss hooks) plus
    // manual Check-now — no scheduled scans. ANOMALY_CRON_SCHEDULE is inert.
    // (startScheduler remains for one-off/manual use, but boot no longer arms it.)

    // Recover pending Sheets deliveries (no-op unless configured)
    sheetsService.startReconciler();
    rateLimitMaintenance.start();

    // Discover due schedules and recover durable background runs
    automationScheduler.reschedule().catch((err) => console.error("[automation] Boot load failed:", err.message));
  });
}

const shutdown = createShutdown({
  readiness,
  getServer: () => httpServer,
  getRealtime: () => realtime,
  workers: [automationScheduler, sheetsService, rateLimitMaintenance],
  disconnect: () => prisma.$disconnect(),
  exit: code => process.exit(code),
});
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

boot();
