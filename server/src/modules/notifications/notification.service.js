import { notificationRepository } from "./notification.repository.js";
import { broadcast } from "../../infrastructure/realtime/hub.js";

/**
 * Notification Service (admin-only readers — enforced in routes + header)
 *
 * Direct creation is best-effort and logs failures without rethrowing. Business
 * mutations needing durable delivery use recordEffects inside their transaction;
 * the effects worker publishes saved notification intent after that commit.
 */
export const notificationService = {
  /**
   * Create directly and return the row on success, or undefined after a logged
   * failure. Awaiting this helper does not provide durable retry guarantees.
   * @param {object} params
   * @param {string} params.type - notification type (order_new, stock_low, etc.)
   * @param {string} params.title - short title
   * @param {string} params.message - description
   * @param {string} [params.referenceType] - related entity type
   * @param {string} [params.referenceId] - related entity ID
   */
  async create({ type, title, message, referenceType, referenceId }) {
    try {
      const created = await notificationRepository.create({
        type,
        title,
        message,
        referenceType,
        referenceId,
      });
      // Admin bell stream: fire-and-forget like the write itself.
      try {
        broadcast("notifications:all", { entity: "notification", id: created?.id ?? null });
      } catch (err) {
        console.warn("[realtime] notification emit dropped:", err?.message);
      }
      return created;
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
