import prisma from "../../config/prisma.js";

export const notificationRepository = {
  async create({ type, title, message, referenceType, referenceId }) {
    return prisma.notification.create({
      data: {
        type,
        title,
        message,
        referenceType: referenceType || null,
        referenceId: referenceId || null,
      },
    });
  },

  async findMany({ page = 1, limit = 20 }) {
    const skip = (page - 1) * limit;
    const [notifications, totalItems] = await Promise.all([
      prisma.notification.findMany({
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.notification.count(),
    ]);
    return { notifications, totalItems };
  },

  async countUnread() {
    return prisma.notification.count({ where: { isRead: false } });
  },

  async markAsRead(id) {
    return prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });
  },

  async markAllAsRead() {
    return prisma.notification.updateMany({
      where: { isRead: false },
      data: { isRead: true },
    });
  },

  async delete(id) {
    return prisma.notification.delete({ where: { id } });
  },

  async deleteOlderThan(days = 30) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    return prisma.notification.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
  },
};
