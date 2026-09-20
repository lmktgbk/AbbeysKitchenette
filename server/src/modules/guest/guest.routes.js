import { Router } from "express";

import { guestController } from "./guest.controller.js";
import { validate, validateQuery, validateParams } from "../../middleware/validate.middleware.js";
import { guestOrderLimiter, guestTrackLimiter } from "../../middleware/rateLimitin.middleware.js";
import { createGuestOrderSchema, getMenuQuerySchema, guestTokenParamSchema } from "./guest.validation.js";

const router = Router();

/**
 * Guest Routes (Public — No Auth)
 *
 * GET  /api/guest/menu          — Available products for customer menu
 * GET  /api/guest/settings      — Store settings for landing page
 * POST /api/guest/orders        — Place online order (strict limit)
 * GET  /api/guest/orders/:token — Track own order (poll-friendly limit)
 *
 * Guests can only read their own order — edits and cancels happen
 * at the counter.
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
  guestOrderLimiter,
  validate(createGuestOrderSchema),
  guestController.placeOrder,
);

// GET /api/guest/orders/:token — track own order
router.get(
  "/orders/:token",
  guestTrackLimiter,
  validateParams(guestTokenParamSchema),
  guestController.trackOrder,
);

export default router;
