import { Router } from "express";
import authenticate from "../../middleware/authenticate.middleware.js";
import authorize from "../../middleware/authorize.middleware.js";
import { dashboardController } from "./dashboard.controller.js";

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
  dashboardController.getDashboard,
);

router.get(
  "/revenue-trend",
  authenticate,
  authorize("admin"),
  dashboardController.getRevenueTrend,
);

router.get(
  "/today",
  authenticate,
  authorize("admin"),
  dashboardController.getTodayDashboard,
);

export default router;
