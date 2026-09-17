import { Router } from "express";
import { shiftController } from "./shift.controller.js";
import { validate, validateQuery, validateParams } from "../../middleware/validate.middleware.js";
import authenticate from "../../middleware/authenticate.middleware.js";
import authorize from "../../middleware/authorize.middleware.js";
import {
  startShiftSchema,
  endShiftSchema,
  shiftIdParamSchema,
  getShiftsQuerySchema,
} from "./shift.validation.js";

const router = Router();

/**
 * Shift Routes
 *
 * POST   /api/shifts           — Start a new shift
 * GET    /api/shifts/active    — Get active shift for logged-in user
 * GET    /api/shifts/reconciliation — Cash reconciliation report
 * GET    /api/shifts           — List shifts (paginated)
 * GET    /api/shifts/:id       — Get shift details
 * PUT    /api/shifts/:id/end   — End a shift
 */

// GET /api/shifts/active — get current active shift
router.get(
  "/active",
  authenticate,
  shiftController.getActiveShift,
);

// GET /api/shifts/reconciliation — cash reconciliation
router.get(
  "/reconciliation",
  authenticate,
  authorize("admin"),
  shiftController.getReconciliation,
);

// GET /api/shifts — list shifts
router.get(
  "/",
  authenticate,
  validateQuery(getShiftsQuerySchema),
  shiftController.listShifts,
);

// POST /api/shifts — start shift
router.post(
  "/",
  authenticate,
  validate(startShiftSchema),
  shiftController.startShift,
);

// GET /api/shifts/:id — get shift details
router.get(
  "/:id",
  authenticate,
  validateParams(shiftIdParamSchema),
  shiftController.getShift,
);

// PUT /api/shifts/:id/end — end shift
router.put(
  "/:id/end",
  authenticate,
  validateParams(shiftIdParamSchema),
  validate(endShiftSchema),
  shiftController.endShift,
);

export default router;
