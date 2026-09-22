import { notificationService } from "./notification.service.js";
import { successResponse, errorResponse } from "../../utils/response.js";

export const notificationController = {
  async getNotifications(req, res) {
    try {
      const { page, limit, type } = req.validatedQuery || {};
      // Comma-separated types (e.g. order_new,order_completed) for group chips.
      // Unknown tokens are dropped so a typo narrows instead of emptying the list.
      const KNOWN_TYPES = new Set([
        "order_new",
        "order_accepted",
        "order_completed",
        "order_cancelled",
        "stock_low",
        "stock_out",
        "stock_restocked",
        "system",
      ]);
      const types = [
        ...new Set(
          String(type || "")
            .split(",")
            .map((t) => t.trim())
            .filter((t) => KNOWN_TYPES.has(t)),
        ),
      ];
      const result = await notificationService.getAll({
        page: Number(page) || 1,
        limit: Number(limit) || 20,
        types: types.length > 0 ? types : undefined,
      });
      return successResponse(res, "Notifications retrieved", result);
    } catch (error) {
      console.error("[GET_NOTIFICATIONS]", error);
      return errorResponse(res, "Something went wrong", null, 500, "GET_NOTIFICATIONS_ERROR");
    }
  },

  async getUnreadCount(req, res) {
    try {
      const result = await notificationService.getUnreadCount();
      return successResponse(res, "Unread count retrieved", result);
    } catch (error) {
      console.error("[GET_UNREAD_COUNT]", error);
      return errorResponse(res, "Something went wrong", null, 500, "GET_UNREAD_COUNT_ERROR");
    }
  },

  async markAsRead(req, res) {
    try {
      await notificationService.markAsRead(req.params.id);
      return successResponse(res, "Notification marked as read");
    } catch (error) {
      console.error("[MARK_READ]", error);
      return errorResponse(res, "Something went wrong", null, 500, "MARK_READ_ERROR");
    }
  },

  async markAllAsRead(req, res) {
    try {
      await notificationService.markAllAsRead();
      return successResponse(res, "All notifications marked as read");
    } catch (error) {
      console.error("[MARK_ALL_READ]", error);
      return errorResponse(res, "Something went wrong", null, 500, "MARK_ALL_READ_ERROR");
    }
  },

  async deleteNotification(req, res) {
    try {
      await notificationService.delete(req.params.id);
      return successResponse(res, "Notification deleted");
    } catch (error) {
      console.error("[DELETE_NOTIFICATION]", error);
      return errorResponse(res, "Something went wrong", null, 500, "DELETE_NOTIFICATION_ERROR");
    }
  },

  async cleanup(req, res) {
    try {
      const { days } = req.body || {};
      const result = await notificationService.cleanup(Number(days) || 30);
      return successResponse(res, "Old notifications cleaned up", result);
    } catch (error) {
      console.error("[CLEANUP]", error);
      return errorResponse(res, "Something went wrong", null, 500, "CLEANUP_ERROR");
    }
  },
};
