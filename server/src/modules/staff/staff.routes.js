import { Router } from "express";
import { staffController } from "./staff.controller.js";
import authenticate from "../../middleware/authenticate.middleware.js";
import authorize from "../../middleware/authorize.middleware.js";
import {
  validate,
  validateQuery,
  validateParams,
} from "../../middleware/validate.middleware.js";
import {
  createStaffSchema,
  updateStaffSchema,
  resetPinSchema,
  resetPasswordSchema,
  idParamSchema,
  getStaffQuerySchema,
  getPerformanceQuerySchema,
} from "./staff.validation.js";

const router = Router();

// All staff routes require authentication + admin role
router.use(authenticate);
router.use(authorize("admin"));

// GET /api/staff/performance — must be before /:id
router.get(
  "/performance",
  validateQuery(getPerformanceQuerySchema),
  staffController.getPerformance,
);

// GET /api/staff — list all staff
router.get(
  "/",
  validateQuery(getStaffQuerySchema),
  staffController.getStaffList,
);

// GET /api/staff/:id — single staff detail
router.get("/:id", validateParams(idParamSchema), staffController.getStaff);

// POST /api/staff — create staff
router.post("/", validate(createStaffSchema), staffController.createStaff);

// PATCH /api/staff/:id — update staff
router.patch(
  "/:id",
  validateParams(idParamSchema),
  validate(updateStaffSchema),
  staffController.updateStaff,
);

// PATCH /api/staff/:id/toggle-active — activate/deactivate
router.patch(
  "/:id/toggle-active",
  validateParams(idParamSchema),
  staffController.toggleActive,
);

// POST /api/staff/:id/reset-pin — reset PIN
router.post(
  "/:id/reset-pin",
  validateParams(idParamSchema),
  validate(resetPinSchema),
  staffController.resetPin,
);

// POST /api/staff/:id/reset-password — reset password
router.post(
  "/:id/reset-password",
  validateParams(idParamSchema),
  validate(resetPasswordSchema),
  staffController.resetPassword,
);

// DELETE /api/staff/:id — hard delete
router.delete(
  "/:id",
  validateParams(idParamSchema),
  staffController.deleteStaff,
);

export default router;
