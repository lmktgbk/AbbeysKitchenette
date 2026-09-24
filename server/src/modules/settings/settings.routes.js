import { Router } from "express";
import { settingsController } from "./settings.controller.js";
import { validate } from "../../middleware/validate.middleware.js";
import authenticate from "../../middleware/authenticate.middleware.js";
import authorize from "../../middleware/authorize.middleware.js";
import { updateSettingsSchema } from "./settings.validation.js";

const router = Router();

// GET /api/settings — get current settings (admin only)
router.get("/", authenticate, authorize("admin"), settingsController.getSettings);

// PATCH /api/settings — update settings (admin only)
router.patch(
  "/",
  authenticate,
  authorize("admin"),
  validate(updateSettingsSchema),
  settingsController.updateSettings,
);

export default router;
