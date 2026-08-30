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

async function proxyForecast(res, path, fallbackCode) {
  try {
    const response = await fetch(`${PYTHON_URL}${path}`);
    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({
        success: false,
        message: `Forecast service error: ${response.status}`,
        error: fallbackCode,
        data: null,
      });
    }
    const data = await response.json();
    return res.status(200).json({
      success: true,
      message: "Forecast retrieved",
      data,
    });
  } catch (error) {
    console.error(`[${fallbackCode}] Forecast service unavailable:`, error.message);
    return res.status(503).json({
      success: false,
      message: "Forecasting service is not running. Start it with: cd forecasting && python main.py",
      error: "FORECAST_SERVICE_UNAVAILABLE",
      data: null,
    });
  }
}

// GET /api/forecasting/sales — sales forecast
router.get(
  "/sales",
  authenticate,
  authorize("admin"),
  (req, res) => {
    const period = req.query.period || 14;
    proxyForecast(res, `/forecast/sales?period=${period}`, "SALES_FORECAST_ERROR");
  },
);

// GET /api/forecasting/restock — restock alerts
router.get(
  "/restock",
  authenticate,
  authorize("admin"),
  (req, res) => proxyForecast(res, "/forecast/restock", "RESTOCK_FORECAST_ERROR"),
);

// GET /api/forecasting/popularity — product trends
router.get(
  "/popularity",
  authenticate,
  authorize("admin"),
  (req, res) => {
    const period = req.query.period || 30;
    proxyForecast(res, `/forecast/popularity?period=${period}`, "POPULARITY_FORECAST_ERROR");
  },
);

export default router;
