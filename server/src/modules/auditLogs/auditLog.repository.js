import prisma from "../../config/prisma.js";

export const auditLogRepository = {
  async create({ userId, action, targetType, targetId, details }) {
    return prisma.auditLog.create({
      data: {
        userId,
        action,
        targetType,
        targetId,
        details: details || undefined,
      },
    });
  },

  async findMany({ page = 1, limit = 50, userId, action, actions, targetType, startDate, endDate, search }) {
    const where = {};

    if (userId) where.userId = userId;
    // Singular `action` (back-compat) plus plural `actions` CSV/array for
    // group filtering — applied server-side so pagination counts are correct.
    const actionList = [
      ...(action ? [action] : []),
      ...(Array.isArray(actions) ? actions : String(actions || "").split(",").filter(Boolean)),
    ];
    const uniqueActions = [...new Set(actionList)];
    if (uniqueActions.length === 1) where.action = uniqueActions[0];
    else if (uniqueActions.length > 1) where.action = { in: uniqueActions };
    if (targetType) where.targetType = targetType;

    // Inclusive Manila calendar days: YYYY-MM-DD is interpreted as Asia/Manila
    // (the UI groups/displays in Manila), tz-independent. Full ISO datetimes
    // fall back to plain Date parsing.
    const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
    const manilaStart = (s) => {
      const [y, m, d] = s.split("-").map(Number);
      return new Date(Date.UTC(y, m - 1, d) - 8 * 3600 * 1000);
    };
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = DAY_RE.test(startDate)
          ? manilaStart(startDate)
          : new Date(startDate);
      }
      if (endDate) {
        if (DAY_RE.test(endDate)) {
          const [y, m, d] = endDate.split("-").map(Number);
          // Start of the NEXT Manila day = exclusive upper bound (full end day included).
          where.createdAt.lt = new Date(Date.UTC(y, m - 1, d + 1) - 8 * 3600 * 1000);
        } else {
          where.createdAt.lte = new Date(endDate);
        }
      }
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
