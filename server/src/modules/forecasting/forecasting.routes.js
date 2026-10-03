import { Router } from "express";
import authenticate from "../../middleware/authenticate.middleware.js";
import authorize from "../../middleware/authorize.middleware.js";
import { validateQuery } from "../../middleware/validate.middleware.js";
import { forecastJobQuerySchema } from "./forecasting.validation.js";
import { auditLogService } from "../auditLogs/auditLog.service.js";
import { ACTIONS } from "../auditLogs/auditLog.constants.js";
import { proxyMlStatus } from "../../realtime/jobs.js";

import { proxyMl } from "../../services/mlClient.js";

const router = Router();

/**
 * Forecasting Proxy Routes
 *
 * Forwards authenticated requests to the Python/FastAPI forecasting service.
 * The Python service handles its own DB queries via asyncpg.
 */

function proxyGet(res, path, fallbackCode) {
  return proxyMl(res, path, { serviceLabel: "Forecast", fallbackCode, okMessage: "Forecast retrieved" });
}

function proxyPost(res, path, fallbackCode) {
  return proxyMl(res, path, { serviceLabel: "Forecast", fallbackCode, okMessage: "Forecast started", method: "POST" });
}

// ── Demand Forecasting ────────────────────────────────────────

// POST /api/forecasting/demand/run — start forecast job
router.post(
  "/demand/run",
  authenticate,
  authorize("admin"),
  (req, res) => {
    auditLogService.logAction({ userId: req.user.id, action: ACTIONS.FORECAST_RUN, targetType: "forecast", details: { source: "manual" } });
    proxyPost(res, "/forecast/demand/run", "DEMAND_RUN_ERROR");
  },
);

// GET /api/forecasting/demand/status — poll progress (arms the server-side
// job watcher while running, so clients stop polling in Phase 3).
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

// GET /api/forecasting/demand/history — get last 2 completed jobs
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
