import { Router } from "express";
import { settingsController } from "./settings.controller.js";
import { validate } from "../../middleware/validate.middleware.js";
import authenticate from "../../middleware/authenticate.middleware.js";
import { updateSettingsSchema } from "./settings.validation.js";

const router = Router();

// GET /api/settings — get current settings (admin only)
router.get("/", authenticate, settingsController.getSettings);

// PATCH /api/settings — update settings (admin only)
router.patch(
  "/",
  authenticate,
  validate(updateSettingsSchema),
  settingsController.updateSettings,
);

export default router;
