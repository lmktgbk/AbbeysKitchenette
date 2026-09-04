import { Router } from "express";
import authenticate from "../../middleware/authenticate.middleware.js";
import authorize from "../../middleware/authorize.middleware.js";

const router = Router();

const PYTHON_URL = process.env.FORECAST_URL || "http://localhost:8000";

/**
 * Market Basket Proxy Routes
 *
 * Forwards authenticated requests to the Python/FastAPI MBA service.
 * Combo product creation uses the existing POST /api/products endpoint.
 */

async function proxyGet(res, path, fallbackCode) {
  try {
    const response = await fetch(`${PYTHON_URL}${path}`);
    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        message: `MBA service error: ${response.status}`,
        error: fallbackCode,
        data: null,
      });
    }
    const data = await response.json();
    return res.status(200).json({ success: true, message: "Success", data });
  } catch (error) {
    console.error(`[${fallbackCode}] MBA service unavailable:`, error.message);
    return res.status(503).json({
      success: false,
      message: "Market basket service is temporarily unavailable. Please try again later.",
      error: "MBA_SERVICE_UNAVAILABLE",
      data: null,
    });
  }
}

async function proxyPost(res, path, body, fallbackCode) {
  try {
    const response = await fetch(`${PYTHON_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        message: `MBA service error: ${response.status}`,
        error: fallbackCode,
        data: null,
      });
    }
    const data = await response.json();
    return res.status(200).json({ success: true, message: "Job created", data });
  } catch (error) {
    console.error(`[${fallbackCode}] MBA service unavailable:`, error.message);
    return res.status(503).json({
      success: false,
      message: "Market basket service is temporarily unavailable. Please try again later.",
      error: "MBA_SERVICE_UNAVAILABLE",
      data: null,
    });
  }
}

// POST /api/market-basket/analyze — create a new analysis job
router.post(
  "/analyze",
  authenticate,
  authorize("admin"),
  (req, res) => {
    const { minSupport, minConfidence, topN } = req.query;
    let path = "/mba/analyze?";
    if (minSupport) path += `min_support=${minSupport}&`;
    if (minConfidence) path += `min_confidence=${minConfidence}&`;
    if (topN) path += `top_n=${topN}&`;
    proxyPost(res, path, {}, "MBA_ANALYZE_ERROR");
  },
);

// GET /api/market-basket/jobs — list recent jobs
router.get(
  "/jobs",
  authenticate,
  authorize("admin"),
  (req, res) => {
    const { limit } = req.query;
    let path = "/mba/jobs?";
    if (limit) path += `limit=${limit}&`;
    proxyGet(res, path, "MBA_JOBS_ERROR");
  },
);

// GET /api/market-basket/jobs/:id — get job with rules
router.get(
  "/jobs/:id",
  authenticate,
  authorize("admin"),
  (req, res) => {
    proxyGet(res, `/mba/jobs/${req.params.id}`, "MBA_JOB_ERROR");
  },
);

// GET /api/market-basket/analyze (sync) — backward-compatible synchronous analysis
router.get(
  "/analyze",
  authenticate,
  authorize("admin"),
  (req, res) => {
    const { minSupport, minConfidence, topN } = req.query;
    let path = "/mba/analyze?";
    if (minSupport) path += `min_support=${minSupport}&`;
    if (minConfidence) path += `min_confidence=${minConfidence}&`;
    if (topN) path += `top_n=${topN}&`;
    proxyGet(res, path, "MBA_ANALYZE_ERROR");
  },
);

// POST /api/market-basket/mark-combo-created — mark a product pair as having a combo
router.post(
  "/mark-combo-created",
  authenticate,
  authorize("admin"),
  (req, res) => {
    proxyPost(res, "/mba/mark-combo-created", req.body, "MBA_MARK_COMBO_ERROR");
  },
);

export default router;
