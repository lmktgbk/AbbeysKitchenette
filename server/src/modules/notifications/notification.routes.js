import { Router } from "express";
import { notificationController } from "./notification.controller.js";
import authenticate from "../../middleware/authenticate.middleware.js";
import authorize from "../../middleware/authorize.middleware.js";
import { validate, validateQuery } from "../../middleware/validate.middleware.js";
import { notificationQuerySchema, cleanupSchema } from "./notification.validation.js";

const router = Router();

router.use(authenticate);
router.use(authorize("admin"));

router.get("/", validateQuery(notificationQuerySchema), notificationController.getNotifications);
router.get("/unread-count", notificationController.getUnreadCount);
router.patch("/read-all", notificationController.markAllAsRead);
router.patch("/:id/read", notificationController.markAsRead);
router.delete("/:id", notificationController.deleteNotification);
router.post("/cleanup", validate(cleanupSchema), notificationController.cleanup);

export default router;
