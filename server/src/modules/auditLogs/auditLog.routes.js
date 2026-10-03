import { Router } from "express";
import { auditLogController } from "./auditLog.controller.js";
import authenticate from "../../middleware/authenticate.middleware.js";
import authorize from "../../middleware/authorize.middleware.js";

import { validateQuery } from "../../middleware/validate.middleware.js";
import { auditLogQuerySchema } from "./auditLog.validation.js";

const router = Router();

// GET /api/audit-logs — view audit logs (admin only)
router.get("/", authenticate, authorize("admin"), validateQuery(auditLogQuerySchema), auditLogController.getLogs);

export default router;
