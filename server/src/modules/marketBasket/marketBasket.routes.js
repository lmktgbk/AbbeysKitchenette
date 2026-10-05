import { Router } from "express";
import authenticate from "../../middleware/authenticate.middleware.js";
import authorize from "../../middleware/authorize.middleware.js";
import { validate, validateQuery, validateParams } from "../../middleware/validate.middleware.js";
import { markComboSchema, mbaAnalyzeQuerySchema, mbaJobsQuerySchema, mbaJobIdParamSchema } from "./marketBasket.validation.js";
import { proxyMlMutation } from "../../infrastructure/integrations/ml/ml.mutation.js";
import { ACTIONS } from "../auditLogs/auditLog.constants.js";
import { proxyMlStatus } from "../../infrastructure/realtime/jobs.js";

import { proxyMl } from "../../infrastructure/integrations/ml/ml.client.js";

const router = Router();

/**
 * Market Basket Proxy Routes
 *
 * Forwards authenticated requests to the Python/FastAPI MBA service.
 * Combo product creation uses POST /api/products with is_bundle:true —
 * the server auto-assigns the system-owned Bundles/Bundle subcategory.
 */

function proxyGet(res, path, fallbackCode) {
  return proxyMl(res, path, { serviceLabel: "MBA", fallbackCode, okMessage: "Success" });
}

/** Map validated API query names to the Python contract for both synchronous and queued analysis. */
function analysisPath(query) {
  const { minSupport, minConfidence, topN } = query || {};
  let path = "/mba/analyze?";
  if (minSupport !== undefined) path += `min_support=${minSupport}&`;
  if (minConfidence !== undefined) path += `min_confidence=${minConfidence}&`;
  if (topN !== undefined) path += `top_n=${topN}&`;
  return path;
}

// POST /api/market-basket/analyze — create a new analysis job
router.post(
  "/analyze",
  authenticate,
  authorize("admin"),
  validateQuery(mbaAnalyzeQuerySchema),
  (req, res) => {
    const path = analysisPath(req.validatedQuery);
    return proxyMlMutation(req, res, path, { serviceLabel: "MBA", body: {}, fallbackCode: "MBA_ANALYZE_ERROR",
      okMessage: "Job created", action: ACTIONS.MBA_RUN, targetType: "market_basket" });
  },
);

// GET /api/market-basket/jobs — list recent jobs
router.get(
  "/jobs",
  authenticate,
  authorize("admin"),
  validateQuery(mbaJobsQuerySchema),
  (req, res) => {
    const { limit } = req.validatedQuery || {};
    let path = "/mba/jobs?";
    if (limit !== undefined) path += `limit=${limit}&`;
    proxyGet(res, path, "MBA_JOBS_ERROR");
  },
);

// GET /api/market-basket/jobs/:id — get job with rules (arms the
// server-side job watcher while running, so clients stop polling).
router.get(
  "/jobs/:id",
  authenticate,
  authorize("admin"),
  validateParams(mbaJobIdParamSchema),
  (req, res) => {
    proxyMlStatus(res, {
      kind: "mba",
      jobId: req.params.id,
      mlPath: `/mba/jobs/${req.params.id}`,
      okMessage: "Success",
      serviceLabel: "MBA",
      fallbackCode: "MBA_JOB_ERROR",
    });
  },
);

// GET /api/market-basket/analyze (sync) — backward-compatible synchronous analysis
router.get(
  "/analyze",
  authenticate,
  authorize("admin"),
  validateQuery(mbaAnalyzeQuerySchema),
  (req, res) => {
    const path = analysisPath(req.validatedQuery);
    proxyGet(res, path, "MBA_ANALYZE_ERROR");
  },
);

// POST /api/market-basket/mark-combo-created — mark a product pair as having a combo
router.post(
  "/mark-combo-created",
  authenticate,
  authorize("admin"),
  validate(markComboSchema),
  (req, res) => {
    return proxyMlMutation(req, res, "/mba/mark-combo-created", { serviceLabel: "MBA", body: req.body,
      fallbackCode: "MBA_MARK_COMBO_ERROR", okMessage: "Combo marked", action: ACTIONS.MBA_COMBO_CREATED,
      targetType: "product", targetId: req.body.product_id });
  },
);

export default router;
