import { Router } from "express";
import authenticate from "../../middleware/authenticate.middleware.js";
import authorize from "../../middleware/authorize.middleware.js";

const router = Router();

const PYTHON_URL = process.env.FORECAST_URL || "http://localhost:8000";

/**
 * Forecasting Proxy Routes
 *
 * Forwards authenticated requests to the Python/FastAPI forecasting service.
 * The Python service handles its own DB queries via asyncpg.
 */

async function proxyGet(res, path, fallbackCode) {
  try {
    const response = await fetch(`${PYTHON_URL}${path}`);
    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        message: `Forecast service error: ${response.status}`,
        error: fallbackCode,
        data: null,
      });
    }
    const data = await response.json();
    return res.status(200).json({ success: true, message: "Forecast retrieved", data });
  } catch (error) {
    console.error(`[${fallbackCode}] Forecast service unavailable:`, error.message);
    return res.status(503).json({
      success: false,
      message: "Forecasting service is temporarily unavailable. Please try again later.",
      error: "FORECAST_SERVICE_UNAVAILABLE",
      data: null,
    });
  }
}

async function proxyPost(res, path, fallbackCode) {
  try {
    const response = await fetch(`${PYTHON_URL}${path}`, { method: "POST" });
    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        message: `Forecast service error: ${response.status}`,
        error: fallbackCode,
        data: null,
      });
    }
    const data = await response.json();
    return res.status(200).json({ success: true, message: "Forecast started", data });
  } catch (error) {
    console.error(`[${fallbackCode}] Forecast service unavailable:`, error.message);
    return res.status(503).json({
      success: false,
      message: "Forecasting service is temporarily unavailable. Please try again later.",
      error: "FORECAST_SERVICE_UNAVAILABLE",
      data: null,
    });
  }
}

// ── Demand Forecasting ────────────────────────────────────────

// POST /api/forecasting/demand/run — start forecast job
router.post(
  "/demand/run",
  authenticate,
  authorize("admin"),
  (req, res) => {
    proxyPost(res, "/forecast/demand/run", "DEMAND_RUN_ERROR");
  },
);

// GET /api/forecasting/demand/status — poll progress
router.get(
  "/demand/status",
  authenticate,
  authorize("admin"),
  (req, res) => {
    const { jobId } = req.query;
    if (!jobId) {
      return res.status(400).json({ success: false, message: "jobId is required" });
    }
    proxyGet(res, `/forecast/demand/status?job_id=${jobId}`, "DEMAND_STATUS_ERROR");
  },
);

// GET /api/forecasting/demand/results — get forecast results
router.get(
  "/demand/results",
  authenticate,
  authorize("admin"),
  (req, res) => {
    const { jobId } = req.query;
    if (!jobId) {
      return res.status(400).json({ success: false, message: "jobId is required" });
    }
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
  (req, res) => {
    const { jobId } = req.query;
    if (!jobId) {
      return res.status(400).json({ success: false, message: "jobId is required" });
    }
    proxyGet(res, `/forecast/demand/ingredients?job_id=${jobId}`, "DEMAND_INGREDIENTS_ERROR");
  },
);

export default router;
