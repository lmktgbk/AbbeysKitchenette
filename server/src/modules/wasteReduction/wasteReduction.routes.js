import { Router } from "express";
import { wasteReductionController } from "./wasteReduction.controller.js";
import { validateParams } from "../../middleware/validate.middleware.js";
import authenticate from "../../middleware/authenticate.middleware.js";
import authorize from "../../middleware/authorize.middleware.js";
import { idParamSchema } from "./wasteReduction.validation.js";

const router = Router();

/**
 * Waste Reduction Routes
 *
 * GET    /api/waste-reduction                  — List pending insights
 * POST   /api/waste-reduction/generate         — Generate new (admin only)
 * POST   /api/waste-reduction/:id/accept       — Accept insight
 * POST   /api/waste-reduction/:id/reject       — Reject insight
 */

// GET /api/waste-reduction — list pending
router.get(
  "/",
  authenticate,
  authorize("admin"),
  wasteReductionController.getInsights,
);

// POST /api/waste-reduction/generate — generate new
router.post(
  "/generate",
  authenticate,
  authorize("admin"),
  wasteReductionController.generateInsights,
);

// POST /api/waste-reduction/:id/accept
router.post(
  "/:id/accept",
  authenticate,
  authorize("admin"),
  validateParams(idParamSchema),
  wasteReductionController.acceptInsight,
);

// POST /api/waste-reduction/:id/reject
router.post(
  "/:id/reject",
  authenticate,
  authorize("admin"),
  validateParams(idParamSchema),
  wasteReductionController.rejectInsight,
);

export default router;
