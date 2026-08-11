/**
 * Server Entry Point
 * Validates requuired .env and loads .env
 * Start express server
 */

import app from "./src/app.js";
import { env } from "./src/config/env.js";

app.listen(env.PORT, () => {
  console.log(
    `Server running in ${env.NODE_ENV} mode on http://localhost:${env.PORT}`,
  );
});
