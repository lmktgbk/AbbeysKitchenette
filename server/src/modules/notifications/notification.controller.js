import { notificationService } from "./notification.service.js";
import { successResponse, errorResponse } from "../../utils/response.js";

export const notificationController = {
  async getNotifications(req, res) {
    try {
      const { page, limit } = req.validatedQuery || {};
      const result = await notificationService.getAll({
        page: Number(page) || 1,
        limit: Number(limit) || 20,
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
