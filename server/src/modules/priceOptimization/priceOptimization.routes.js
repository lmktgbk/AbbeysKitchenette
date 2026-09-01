import { Router } from "express";
import priceOptimizationController from "./priceOptimization.controller.js";
import authenticate from "../../middleware/authenticate.middleware.js";
import authorize from "../../middleware/authorize.middleware.js";
import { validate, validateParams } from "../../middleware/validate.middleware.js";
import { generateSchema, idParamSchema } from "./priceOptimization.validation.js";

const router = Router();

/**
 * Price Optimization Routes
 *
 * GET    /api/price-optimization              — Get pending suggestions
 * POST   /api/price-optimization/generate     — Generate suggestions for a product
 * POST   /api/price-optimization/:id/apply    — Apply recommended price
 * POST   /api/price-optimization/:id/dismiss  — Dismiss a suggestion
 */

router.get(
  "/",
  authenticate,
  authorize("admin"),
  priceOptimizationController.getSuggestions,
);

router.post(
  "/generate",
  authenticate,
  authorize("admin"),
  validate(generateSchema),
  priceOptimizationController.generateSuggestions,
);

router.post(
  "/:id/apply",
  authenticate,
  authorize("admin"),
  validateParams(idParamSchema),
  priceOptimizationController.applyPrice,
);

router.post(
  "/:id/dismiss",
  authenticate,
  authorize("admin"),
  validateParams(idParamSchema),
  priceOptimizationController.dismissSuggestion,
);

export default router;
