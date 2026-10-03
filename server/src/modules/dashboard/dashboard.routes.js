import { Router } from "express";
import authenticate from "../../middleware/authenticate.middleware.js";
import authorize from "../../middleware/authorize.middleware.js";
import { dashboardController } from "./dashboard.controller.js";

import { validateQuery } from "../../middleware/validate.middleware.js";
import { dashboardQuerySchema } from "./dashboard.validation.js";

const router = Router();

/**
 * Dashboard Routes
 *
 * GET /api/dashboard — consolidated dashboard analytics (admin only)
 */
router.get(
  "/",
  authenticate,
  authorize("admin"),
  validateQuery(dashboardQuerySchema),
  dashboardController.getDashboard,
);

router.get(
  "/revenue-trend",
  authenticate,
  authorize("admin"),
  dashboardController.getRevenueTrend,
);

export default router;
