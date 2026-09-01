import { Router } from "express";
import { reorderSuggestionsController } from "./reorderSuggestions.controller.js";
import { validateParams } from "../../middleware/validate.middleware.js";
import authenticate from "../../middleware/authenticate.middleware.js";
import authorize from "../../middleware/authorize.middleware.js";
import { idParamSchema } from "./reorderSuggestions.validation.js";

const router = Router();

/**
 * Reorder Suggestions Routes
 *
 * GET    /api/reorder-suggestions              — List pending suggestions
 * POST   /api/reorder-suggestions/generate     — Generate new (admin only)
 * POST   /api/reorder-suggestions/:id/accept   — Accept suggestion
 * POST   /api/reorder-suggestions/:id/reject   — Reject suggestion
 */

// GET /api/reorder-suggestions — list pending
router.get(
  "/",
  authenticate,
  authorize("admin"),
  reorderSuggestionsController.getSuggestions,
);

// POST /api/reorder-suggestions/generate — generate new
router.post(
  "/generate",
  authenticate,
  authorize("admin"),
  reorderSuggestionsController.generateSuggestions,
);

// POST /api/reorder-suggestions/:id/accept
router.post(
  "/:id/accept",
  authenticate,
  authorize("admin"),
  validateParams(idParamSchema),
  reorderSuggestionsController.acceptSuggestion,
);

// POST /api/reorder-suggestions/:id/reject
router.post(
  "/:id/reject",
  authenticate,
  authorize("admin"),
  validateParams(idParamSchema),
  reorderSuggestionsController.rejectSuggestion,
);

export default router;
