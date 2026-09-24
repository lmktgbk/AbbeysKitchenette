import { Router } from "express";
import { auditLogController } from "./auditLog.controller.js";
import authenticate from "../../middleware/authenticate.middleware.js";
import authorize from "../../middleware/authorize.middleware.js";

const router = Router();

// GET /api/audit-logs — view audit logs (admin only)
router.get("/", authenticate, authorize("admin"), auditLogController.getLogs);

export default router;
