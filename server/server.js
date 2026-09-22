/**
 * Server Entry Point
 * Validates required .env and loads .env
 * Pre-flights the database, then starts express server
 */

import app from "./src/app.js";
import { env } from "./src/config/env.js";
import prisma from "./src/config/prisma.js";
import { anomalyService } from "./src/modules/anomalyDetection/anomalyDetection.service.js";
import { automationScheduler } from "./src/modules/automation/automation.scheduler.js";

async function boot() {
  // Fail fast when the database is unreachable — never serve a dead API.
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    console.error("[boot] Database unreachable:", err.message);
    process.exit(1);
  }

  app.listen(env.PORT, () => {
    console.log(
      `Server running in ${env.NODE_ENV} mode on http://localhost:${env.PORT}`,
    );

    // Start anomaly detection scheduler
    anomalyService.startScheduler();

    // Load automation schedules (ML jobs) from settings
    automationScheduler.reschedule().catch((err) => console.error("[automation] Boot load failed:", err.message));
  });
}

// Graceful shutdown — drain the pool instead of dropping queries mid-flight.
process.on("SIGTERM", async () => {
  try {
    await prisma.$disconnect();
  } finally {
    process.exit(0);
  }
});

boot();
