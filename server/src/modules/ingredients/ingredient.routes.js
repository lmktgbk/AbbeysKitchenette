import { Router } from "express";

import { ingredientController } from "./ingredient.controller.js";
import { validate, validateQuery, validateParams } from "../../middleware/validate.middleware.js";
import authenticate from "../../middleware/authenticate.middleware.js";
import authorize from "../../middleware/authorize.middleware.js";
import {
  createIngredientSchema,
  updateIngredientSchema,
  idParamSchema,
  batchIdParamSchema,
  restockIngredientSchema,
  declareLossSchema,
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
 * GET    /api/ingredients/alerts       — Active stock alerts for sidebar
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

// GET /api/ingredients/alerts — active stock alerts (must be before /:id)
router.get(
  "/alerts",
  authenticate,
  authorize("admin"),
  ingredientController.getActiveAlerts,
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

// PATCH /api/ingredients/:id — edit ingredient (name and/or min threshold)
router.patch(
  "/:id",
  authenticate,
  authorize("admin"),
  validateParams(idParamSchema),
  validate(updateIngredientSchema),
  ingredientController.updateIngredient,
);

// POST /api/ingredients/:id/restock — add stock via new FIFO batch (must be before /:id routes)
router.post(
  "/:id/restock",
  authenticate,
  authorize("admin"),
  validateParams(idParamSchema),
  validate(restockIngredientSchema),
  ingredientController.restockIngredient,
);

// POST /api/ingredients/:id/loss — declare a loss (must be before /:id routes)
router.post(
  "/:id/loss",
  authenticate,
  authorize("admin"),
  validateParams(idParamSchema),
  validate(declareLossSchema),
  ingredientController.declareLoss,
);

// GET /api/ingredients/:id/batches — restock batches for an ingredient
router.get(
  "/:id/batches",
  authenticate,
  authorize("admin"),
  validateParams(idParamSchema),
  validateQuery(getBatchesQuerySchema),
  ingredientController.getBatches,
);

// PATCH /api/ingredients/:id/batches/follow-fifo — clear all priority flags (must be before /:batchId)
router.patch(
  "/:id/batches/follow-fifo",
  authenticate,
  authorize("admin"),
  validateParams(idParamSchema),
  ingredientController.followFifo,
);

// PATCH /api/ingredients/:id/batches/:batchId/priority — toggle priority on a batch
router.patch(
  "/:id/batches/:batchId/priority",
  authenticate,
  authorize("admin"),
  validateParams(batchIdParamSchema),
  validate(togglePrioritySchema),
  ingredientController.toggleBatchPriority,
);

// GET /api/ingredients/:id/history — stock adjustment logs
router.get(
  "/:id/history",
  authenticate,
  authorize("admin"),
  validateParams(idParamSchema),
  validateQuery(getHistoryQuerySchema),
  ingredientController.getHistory,
);

// PATCH /api/ingredients/:id/archive — archive
router.patch(
  "/:id/archive",
  authenticate,
  authorize("admin"),
  validateParams(idParamSchema),
  ingredientController.archiveIngredient,
);

// PATCH /api/ingredients/:id/restore — restore
router.patch(
  "/:id/restore",
  authenticate,
  authorize("admin"),
  validateParams(idParamSchema),
  ingredientController.restoreIngredient,
);

// DELETE /api/ingredients/:id — hard delete
router.delete(
  "/:id",
  authenticate,
  authorize("admin"),
  validateParams(idParamSchema),
  ingredientController.deleteIngredient,
);

export default router;
