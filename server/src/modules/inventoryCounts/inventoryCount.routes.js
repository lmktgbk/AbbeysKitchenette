import { Router } from "express";
import { inventoryCountController } from "./inventoryCount.controller.js";
import { validate, validateQuery, validateParams } from "../../middleware/validate.middleware.js";
import authenticate from "../../middleware/authenticate.middleware.js";
import authorize from "../../middleware/authorize.middleware.js";
import {
  startCountSchema,
  submitCountSchema,
  countIdParamSchema,
  getCountsQuerySchema,
} from "./inventoryCount.validation.js";

const router = Router();

/**
 * Inventory Count Routes
 *
 * POST   /api/inventory-counts           — Start a new count
 * GET    /api/inventory-counts/active    — Get active count
 * GET    /api/inventory-counts           — List counts (paginated)
 * GET    /api/inventory-counts/:id       — Get count details
 * POST   /api/inventory-counts/:id/submit — Submit count results
 * GET    /api/inventory-counts/:id/summary — Get count summary
 */

// GET /api/inventory-counts/active
router.get(
  "/active",
  authenticate,
  inventoryCountController.getActiveCount,
);

// GET /api/inventory-counts
router.get(
  "/",
  authenticate,
  validateQuery(getCountsQuerySchema),
  inventoryCountController.listCounts,
);

// POST /api/inventory-counts
router.post(
  "/",
  authenticate,
  authorize("admin", "manager"),
  validate(startCountSchema),
  inventoryCountController.startCount,
);

// GET /api/inventory-counts/:id
router.get(
  "/:id",
  authenticate,
  validateParams(countIdParamSchema),
  inventoryCountController.getCount,
);

// POST /api/inventory-counts/:id/submit
router.post(
  "/:id/submit",
  authenticate,
  validateParams(countIdParamSchema),
  validate(submitCountSchema),
  inventoryCountController.submitCount,
);

// GET /api/inventory-counts/:id/summary
router.get(
  "/:id/summary",
  authenticate,
  validateParams(countIdParamSchema),
  inventoryCountController.getSummary,
);

export default router;
