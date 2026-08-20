import { Router } from "express";

import { ingredientController } from "./ingredient.controller.js";
import { validate } from "../../middleware/validate.middleware.js";
import authenticate from "../../middleware/authenticate.middleware.js";
import authorize from "../../middleware/authorize.middleware.js";
import { createIngredientSchema } from "./ingredient.validation.js";

const router = Router();

/**
 * Ingredient Routes
 *
 * GET    /api/ingredients              — List all ingredients
 * GET    /api/ingredients/archived     — List archived ingredients
 * GET    /api/ingredients/summary      — Status counts for KPI cards
 * POST   /api/ingredients              — Create ingredient
 * PATCH  /api/ingredients/:id/archive  — Archive ingredient
 * PATCH  /api/ingredients/:id/restore  — Restore ingredient
 * DELETE /api/ingredients/:id          — Delete ingredient
 */

// GET /api/ingredients/summary — status counts (must be before /:id)
router.get(
  "/summary",
  authenticate,
  authorize("admin"),
  ingredientController.getSummary,
);

// GET /api/ingredients/archived — archived list (must be before /:id)
router.get(
  "/archived",
  authenticate,
  authorize("admin"),
  ingredientController.getArchivedIngredients,
);

// GET /api/ingredients — list all non-archived
router.get(
  "/",
  authenticate,
  authorize("admin"),
  ingredientController.getIngredients,
);

// POST /api/ingredients — create ingredient
router.post(
  "/",
  authenticate,
  authorize("admin"),
  validate(createIngredientSchema),
  ingredientController.createIngredient,
);

// PATCH /api/ingredients/:id/archive — archive
router.patch(
  "/:id/archive",
  authenticate,
  authorize("admin"),
  ingredientController.archiveIngredient,
);

// PATCH /api/ingredients/:id/restore — restore
router.patch(
  "/:id/restore",
  authenticate,
  authorize("admin"),
  ingredientController.restoreIngredient,
);

// DELETE /api/ingredients/:id — hard delete
router.delete(
  "/:id",
  authenticate,
  authorize("admin"),
  ingredientController.deleteIngredient,
);

export default router;
