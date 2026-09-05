import { Router } from "express";
import { auditLogController } from "./auditLog.controller.js";
import authenticate from "../../middleware/authenticate.middleware.js";

const router = Router();

// GET /api/audit-logs — view audit logs (admin only)
router.get("/", authenticate, auditLogController.getLogs);

export default router;
