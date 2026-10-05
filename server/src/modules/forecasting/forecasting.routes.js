import { Router } from "express";
import authenticate from "../../middleware/authenticate.middleware.js";
import authorize from "../../middleware/authorize.middleware.js";
import { validateQuery } from "../../middleware/validate.middleware.js";
import { forecastJobQuerySchema } from "./forecasting.validation.js";
import { proxyMlMutation } from "../../infrastructure/integrations/ml/ml.mutation.js";
import { ACTIONS } from "../auditLogs/auditLog.constants.js";
import { proxyMlStatus } from "../../infrastructure/realtime/jobs.js";

import { proxyMl } from "../../infrastructure/integrations/ml/ml.client.js";

const router = Router();

/**
 * Forecasting Proxy Routes
 *
 * Forwards authenticated requests to the Python/FastAPI forecasting service.
 * The Python service handles its own DB queries via asyncpg.
 */

/** Read an ML resource through the shared authenticated transport and API envelope. */
function proxyGet(res, path, fallbackCode) {
  return proxyMl(res, path, { serviceLabel: "Forecast", fallbackCode, okMessage: "Forecast retrieved" });
}

// ── Demand Forecasting ────────────────────────────────────────

// POST /api/forecasting/demand/run — start forecast job
router.post(
  "/demand/run",
  authenticate,
  authorize("admin"),
  (req, res) => {
    return proxyMlMutation(req, res, "/forecast/demand/run", { serviceLabel: "Forecast",
      fallbackCode: "DEMAND_RUN_ERROR", okMessage: "Forecast started", action: ACTIONS.FORECAST_RUN, targetType: "forecast" });
  },
);

// GET /api/forecasting/demand/status — poll progress (arms the server-side
// job watcher while running; clients retain polling as a delivery fallback).
router.get(
  "/demand/status",
  authenticate,
  authorize("admin"),
  validateQuery(forecastJobQuerySchema),
  (req, res) => {
    const { jobId } = req.validatedQuery;
    proxyMlStatus(res, {
      kind: "forecast",
      jobId,
      mlPath: `/forecast/demand/status?job_id=${jobId}`,
      okMessage: "Forecast retrieved",
      serviceLabel: "Forecast",
      fallbackCode: "DEMAND_STATUS_ERROR",
    });
  },
);

// GET /api/forecasting/demand/results — get forecast results
router.get(
  "/demand/results",
  authenticate,
  authorize("admin"),
  validateQuery(forecastJobQuerySchema),
  (req, res) => {
    const { jobId } = req.validatedQuery;
    proxyGet(res, `/forecast/demand/results?job_id=${jobId}`, "DEMAND_RESULTS_ERROR");
  },
);

// GET /api/forecasting/demand/history — recent terminal jobs, including failures
router.get(
  "/demand/history",
  authenticate,
  authorize("admin"),
  (req, res) => proxyGet(res, "/forecast/demand/history", "DEMAND_HISTORY_ERROR"),
);

// GET /api/forecasting/demand/ingredients — ingredient needs from forecast
router.get(
  "/demand/ingredients",
  authenticate,
  authorize("admin"),
  validateQuery(forecastJobQuerySchema),
  (req, res) => {
    const { jobId } = req.validatedQuery;
    proxyGet(res, `/forecast/demand/ingredients?job_id=${jobId}`, "DEMAND_INGREDIENTS_ERROR");
  },
);

export default router;
