import { Router } from "express";

import { orderController } from "./order.controller.js";
import { validate, validateQuery, validateParams } from "../../middleware/validate.middleware.js";
import authenticate from "../../middleware/authenticate.middleware.js";
import authorize from "../../middleware/authorize.middleware.js";
import {
  createOrderSchema,
  updateOrderSchema,
  updateStatusSchema,
  cancelOrderSchema,
  fulfillOrderSchema,
  checkOrderItemSchema,
  overrideLossSchema,
  removeItemSchema,
  orderIdParamSchema,
  orderItemParamSchema,
  lossIdParamSchema,
  getOrdersQuerySchema,
} from "./order.validation.js";

const router = Router();

/**
 * Order Routes
 *
 * GET    /api/orders/stats       — Status counts for KPI cards
 * GET    /api/orders             — List all orders (paginated)
 * POST   /api/orders             — Create walk-in order (auto-accepted)
 * GET    /api/orders/:id         — Get order detail
 * PUT    /api/orders/:id         — Edit pending order
 * PUT    /api/orders/:id/status  — Advance order status
 * POST   /api/orders/:id/cancel  — Delete or cancel order
 */

// GET /api/orders/stats — status counts (must be before /:id)
router.get(
  "/stats",
  authenticate,
  authorize("admin", "cashier"),
  orderController.getStats,
);

// GET /api/orders/kitchen — kitchen display (must be before /:id)
router.get(
  "/kitchen",
  authenticate,
  authorize("admin", "cashier", "kitchen"),
  orderController.getKitchenOrders,
);

// GET /api/orders/kitchen/batches — batch preparation groups (must be before /:id)
router.get(
  "/kitchen/batches",
  authenticate,
  authorize("admin", "cashier", "kitchen"),
  orderController.getBatchGroups,
);

// GET /api/orders — list all orders
router.get(
  "/",
  authenticate,
  authorize("admin", "cashier", "kitchen"),
  validateQuery(getOrdersQuerySchema),
  orderController.getOrders,
);

// POST /api/orders — create walk-in order
router.post(
  "/",
  authenticate,
  authorize("admin", "cashier"),
  validate(createOrderSchema),
  orderController.createOrder,
);

// GET /api/orders/:id — order detail
router.get(
  "/:id",
  authenticate,
  authorize("admin", "cashier", "kitchen"),
  validateParams(orderIdParamSchema),
  orderController.getOrder,
);

// PUT /api/orders/:id — edit pending order
router.put(
  "/:id",
  authenticate,
  authorize("admin", "cashier"),
  validateParams(orderIdParamSchema),
  validate(updateOrderSchema),
  orderController.updateOrder,
);

// PUT /api/orders/:id/status — advance status
router.put(
  "/:id/status",
  authenticate,
  authorize("admin", "cashier", "kitchen"),
  validateParams(orderIdParamSchema),
  validate(updateStatusSchema),
  orderController.updateStatus,
);

// POST /api/orders/:id/fulfill — fulfill pending online order (edit + accept)
router.post(
  "/:id/fulfill",
  authenticate,
  authorize("admin", "cashier"),
  validateParams(orderIdParamSchema),
  validate(fulfillOrderSchema),
  orderController.fulfillOrder,
);

// POST /api/orders/:id/prepare — transition to preparing
router.post(
  "/:id/prepare",
  authenticate,
  authorize("admin", "cashier", "kitchen"),
  validateParams(orderIdParamSchema),
  orderController.prepareOrder,
);

// PATCH /api/orders/:id/items/:itemId — toggle item prepared
router.patch(
  "/:id/items/:itemId",
  authenticate,
  authorize("admin", "cashier", "kitchen"),
  validateParams(orderItemParamSchema),
  validate(checkOrderItemSchema),
  orderController.checkOrderItem,
);

// POST /api/orders/:id/items/:itemId/remove — remove item from order
router.post(
  "/:id/items/:itemId/remove",
  authenticate,
  authorize("admin", "cashier"),
  validateParams(orderItemParamSchema),
  validate(removeItemSchema),
  orderController.removeItem,
);

// POST /api/orders/losses/:lossId/override — override a loss
router.post(
  "/losses/:lossId/override",
  authenticate,
  authorize("admin"),
  validateParams(lossIdParamSchema),
  validate(overrideLossSchema),
  orderController.overrideLoss,
);

// POST /api/orders/:id/cancel — delete or cancel
router.post(
  "/:id/cancel",
  authenticate,
  authorize("admin", "cashier"),
  validateParams(orderIdParamSchema),
  validate(cancelOrderSchema),
  orderController.cancelOrder,
);

export default router;
