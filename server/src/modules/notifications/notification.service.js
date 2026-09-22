import { notificationRepository } from "./notification.repository.js";

/**
 * Notification Service
 *
 * Centralized notification creation and management.
 * Other modules call notificationService.create() to push notifications.
 */
export const notificationService = {
  /**
   * Create a notification. Fire-and-forget — failures are silently caught.
   * @param {object} params
   * @param {string} params.type - notification type (order_new, stock_low, etc.)
   * @param {string} params.title - short title
   * @param {string} params.message - description
   * @param {string} [params.referenceType] - related entity type
   * @param {string} [params.referenceId] - related entity ID
   */
  async create({ type, title, message, referenceType, referenceId }) {
    try {
      return await notificationRepository.create({
        type,
        title,
        message,
        referenceType,
        referenceId,
      });
    } catch (err) {
      console.error("[notification] Failed to create:", type, err.message);
    }
  },

  /**
   * Get paginated notifications.
   */
  async getAll({ page = 1, limit = 20, types } = {}) {
    const result = await notificationRepository.findMany({ page, limit, types });
    return {
      notifications: result.notifications.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        message: n.message,
        reference_type: n.referenceType,
        reference_id: n.referenceId,
        is_read: n.isRead,
        created_at: n.createdAt,
      })),
      totalItems: result.totalItems,
    };
  },

  /**
   * Get unread count.
   */
  async getUnreadCount() {
    const count = await notificationRepository.countUnread();
    return { unread_count: count };
  },

  /**
   * Mark a single notification as read.
   */
  async markAsRead(id) {
    return notificationRepository.markAsRead(id);
  },

  /**
   * Mark all notifications as read.
   */
  async markAllAsRead() {
    await notificationRepository.markAllAsRead();
    return { success: true };
  },

  /**
   * Delete a notification.
   */
  async delete(id) {
    await notificationRepository.delete(id);
    return { success: true };
  },

  /**
   * Cleanup old notifications (older than N days).
   */
  async cleanup(days = 30) {
    const result = await notificationRepository.deleteOlderThan(days);
    return { deleted: result.count };
  },
};
