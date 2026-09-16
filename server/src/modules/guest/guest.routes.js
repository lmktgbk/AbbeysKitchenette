import { Router } from "express";

import { guestController } from "./guest.controller.js";
import { validate, validateQuery } from "../../middleware/validate.middleware.js";
import { createGuestOrderSchema, getMenuQuerySchema } from "./guest.validation.js";

const router = Router();

/**
 * Guest Routes (Public — No Auth)
 *
 * GET  /api/guest/menu     — Available products for customer menu
 * GET  /api/guest/settings — Store settings for landing page
 * POST /api/guest/orders   — Place online order
 */

// GET /api/guest/settings — public store settings
router.get("/settings", guestController.getStoreSettings);

// GET /api/guest/menu — available products
router.get(
  "/menu",
  validateQuery(getMenuQuerySchema),
  guestController.getMenu,
);

// POST /api/guest/orders — place order
router.post(
  "/orders",
  validate(createGuestOrderSchema),
  guestController.placeOrder,
);

export default router;
