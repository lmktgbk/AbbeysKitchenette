import { Router } from "express";

import { shiftController } from "./shift.controller.js";
import { validate, validateQuery, validateParams } from "../../middleware/validate.middleware.js";
import authenticate from "../../middleware/authenticate.middleware.js";
import authorize from "../../middleware/authorize.middleware.js";
import {
  openShiftSchema,
  closeShiftSchema,
  forceCloseShiftSchema,
  shiftIdParamSchema,
  getShiftStatsQuerySchema,
  getShiftOrdersQuerySchema,
  getShiftsQuerySchema,
} from "./shift.validation.js";

const router = Router();

/**
 * Shift Routes (BR-02)
 *
 * POST   /api/shifts/open             — Open drawer session (cashier/admin)
 * GET    /api/shifts/mine             — Own open shifts (cashier/admin)
 * GET    /api/shifts/mine/history     — Own closed shifts (cashier/admin)
 * GET    /api/shifts/stats            — KPI aggregates (admin)
 * GET    /api/shifts                  — List all shifts (admin)
 * GET    /api/shifts/:id/orders       — Orders of one shift (owner/admin)
 * GET    /api/shifts/:id              — Single shift + summary (owner/admin)
 * GET    /api/shifts/:id/summary      — Reconciliation breakdown (owner/admin)
 * POST   /api/shifts/:id/close        — End own shift (cashier/admin)
 * POST   /api/shifts/:id/force-close  — End someone's shift (admin)
 */

router.post(
  "/open",
  authenticate,
  authorize("admin", "cashier"),
  validate(openShiftSchema),
  shiftController.openShift,
);

router.get(
  "/mine",
  authenticate,
  authorize("admin", "cashier"),
  shiftController.getMine,
);

router.get(
  "/mine/history",
  authenticate,
  authorize("admin", "cashier"),
  shiftController.getMyHistory,
);

// GET /api/shifts/stats — KPI aggregates (must be before /:id)
router.get(
  "/stats",
  authenticate,
  authorize("admin"),
  validateQuery(getShiftStatsQuerySchema),
  shiftController.getStats,
);

router.get(
  "/",
  authenticate,
  authorize("admin"),
  validateQuery(getShiftsQuerySchema),
  shiftController.getShifts,
);

router.get(
  "/:id",
  authenticate,
  authorize("admin", "cashier"),
  validateParams(shiftIdParamSchema),
  shiftController.getShift,
);

router.get(
  "/:id/summary",
  authenticate,
  authorize("admin", "cashier"),
  validateParams(shiftIdParamSchema),
  shiftController.getSummary,
);

router.get(
  "/:id/ingredient-usage",
  authenticate,
  authorize("admin", "cashier"),
  validateParams(shiftIdParamSchema),
  shiftController.getIngredientUsage,
);

router.get(
  "/:id/orders",
  authenticate,
  authorize("admin", "cashier"),
  validateParams(shiftIdParamSchema),
  validateQuery(getShiftOrdersQuerySchema),
  shiftController.getShiftOrders,
);

router.post(
  "/:id/close",
  authenticate,
  authorize("admin", "cashier"),
  validateParams(shiftIdParamSchema),
  validate(closeShiftSchema),
  shiftController.closeShift,
);

router.post(
  "/:id/force-close",
  authenticate,
  authorize("admin"),
  validateParams(shiftIdParamSchema),
  validate(forceCloseShiftSchema),
  shiftController.forceCloseShift,
);

export default router;
