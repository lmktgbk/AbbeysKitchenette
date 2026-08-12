import { Router } from "express";

import { authController } from "./auth.controller.js";
import { validate } from "../../middleware/validate.middleware.js";
import authenticate from "../../middleware/authenticate.middleware.js";
import requireStoreDevice from "../../middleware/requiredStoreDevice.middleware.js";
import { loginSchema, loginPinSchema } from "./auth.validation.js";

const router = Router();

// POST /api/auth/login — email + password (all roles)
router.post("/login", validate(loginSchema), authController.login);

// POST /api/auth/login-pin — PIN login (store IP only)
router.post(
  "/login-pin",
  validate(loginPinSchema),
  requireStoreDevice,
  authController.loginPin,
);

// GET /api/auth/staff-list — staff grid for PIN login (store IP only)
router.get("/staff-list", requireStoreDevice, authController.getStaffList);

// GET /api/auth/me — current user (protected)
router.get("/me", authenticate, authController.getMe);

// POST /api/auth/logout — clear cookie (protected)
router.post("/logout", authenticate, authController.logout);

export default router;
