/**
 * Server Entry Point
 * Validates requuired .env and loads .env
 * Start express server
 */

import app from "./src/app.js";
import { env } from "./src/config/env.js";
import { anomalyService } from "./src/modules/anomalyDetection/anomalyDetection.service.js";

app.listen(env.PORT, () => {
  console.log(
    `Server running in ${env.NODE_ENV} mode on http://localhost:${env.PORT}`,
  );

  // Start anomaly detection scheduler
  anomalyService.startScheduler();
});
