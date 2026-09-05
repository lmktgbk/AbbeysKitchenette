import prisma from "../../config/prisma.js";

export const auditLogRepository = {
  async create({ userId, action, targetType, targetId, details, ipAddress }) {
    return prisma.auditLog.create({
      data: {
        userId,
        action,
        targetType,
        targetId,
        details: details || undefined,
        ipAddress,
      },
    });
  },

  async findMany({ page = 1, limit = 50, userId, action, targetType, startDate, endDate, search }) {
    const where = {};

    if (userId) where.userId = userId;
    if (action) where.action = action;
    if (targetType) where.targetType = targetType;

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    if (search) {
      where.OR = [
        { action: { contains: search, mode: "insensitive" } },
        { targetType: { contains: search, mode: "insensitive" } },
        { targetId: { contains: search, mode: "insensitive" } },
      ];
    }

    const skip = (page - 1) * limit;

    const [logs, totalItems] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, email: true, role: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.auditLog.count({ where }),
    ]);

    return {
      logs,
      pagination: {
        page,
        limit,
        totalItems,
        totalPages: Math.ceil(totalItems / limit),
      },
    };
  },
};
