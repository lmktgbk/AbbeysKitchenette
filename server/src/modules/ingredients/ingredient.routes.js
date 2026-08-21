import { Router } from "express";

import { ingredientController } from "./ingredient.controller.js";
import { validate, validateQuery } from "../../middleware/validate.middleware.js";
import authenticate from "../../middleware/authenticate.middleware.js";
import authorize from "../../middleware/authorize.middleware.js";
import {
  createIngredientSchema,
  restockIngredientSchema,
  togglePrioritySchema,
  getIngredientsQuerySchema,
  getArchivedQuerySchema,
  getBatchesQuerySchema,
  getHistoryQuerySchema,
} from "./ingredient.validation.js";

const router = Router();

/**
 * Ingredient Routes
 *
 * GET    /api/ingredients              — List all ingredients
 * GET    /api/ingredients/archived     — List archived ingredients
 * GET    /api/ingredients/summary      — Status counts for KPI cards
 * POST   /api/ingredients              — Create ingredient
 * POST   /api/ingredients/:id/restock  — Restock ingredient
 * GET    /api/ingredients/:id/batches  — Get restock batches
 * GET    /api/ingredients/:id/history  — Stock adjustment logs
 * PATCH  /api/ingredients/:id/batches/follow-fifo — Clear all priority flags
 * PATCH  /api/ingredients/:id/batches/:batchId/priority — Toggle batch priority
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
  validateQuery(getArchivedQuerySchema),
  ingredientController.getArchivedIngredients,
);

// GET /api/ingredients — list all non-archived (with pagination, search, filter, sort)
router.get(
  "/",
  authenticate,
  authorize("admin"),
  validateQuery(getIngredientsQuerySchema),
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

// POST /api/ingredients/:id/restock — add stock via new FIFO batch (must be before /:id routes)
router.post(
  "/:id/restock",
  authenticate,
  authorize("admin"),
  validate(restockIngredientSchema),
  ingredientController.restockIngredient,
);

// GET /api/ingredients/:id/batches — restock batches for an ingredient
router.get(
  "/:id/batches",
  authenticate,
  authorize("admin"),
  validateQuery(getBatchesQuerySchema),
  ingredientController.getBatches,
);

// PATCH /api/ingredients/:id/batches/follow-fifo — clear all priority flags (must be before /:batchId)
router.patch(
  "/:id/batches/follow-fifo",
  authenticate,
  authorize("admin"),
  ingredientController.followFifo,
);

// PATCH /api/ingredients/:id/batches/:batchId/priority — toggle priority on a batch
router.patch(
  "/:id/batches/:batchId/priority",
  authenticate,
  authorize("admin"),
  validate(togglePrioritySchema),
  ingredientController.toggleBatchPriority,
);

// GET /api/ingredients/:id/history — stock adjustment logs
router.get(
  "/:id/history",
  authenticate,
  authorize("admin"),
  validateQuery(getHistoryQuerySchema),
  ingredientController.getHistory,
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
