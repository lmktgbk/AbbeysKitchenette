import prisma from "../../config/prisma.js";

export const inventoryCountRepository = {
  async create({ staffId, notes }) {
    return prisma.inventoryCount.create({
      data: {
        countedBy: staffId,
        notes: notes || null,
        status: "in_progress",
      },
    });
  },

  async createItems(countId, items, tx) {
    const client = tx || prisma;
    return client.inventoryCountItem.createMany({
      data: items.map((item) => ({
        inventoryCountId: countId,
        ingredientId: item.ingredientId,
        systemQuantity: item.systemQuantity,
        actualQuantity: item.actualQuantity,
        variance: item.actualQuantity - item.systemQuantity,
        notes: item.notes || null,
      })),
    });
  },

  async complete(countId) {
    return prisma.inventoryCount.update({
      where: { inventoryCountId: countId },
      data: { status: "completed", completedAt: new Date() },
    });
  },

  async findById(countId) {
    return prisma.inventoryCount.findUnique({
      where: { inventoryCountId: countId },
      include: {
        staff: { select: { id: true, name: true, role: true } },
        items: {
          include: {
            ingredient: { select: { ingredientId: true, ingredientName: true, unit: true } },
          },
        },
      },
    });
  },

  async findActive() {
    return prisma.inventoryCount.findFirst({
      where: { status: "in_progress" },
      orderBy: { startedAt: "desc" },
    });
  },

  async findMany({ page, limit, status, dateFrom, dateTo }) {
    const where = {};
    if (status) where.status = status;
    if (dateFrom || dateTo) {
      where.startedAt = {};
      if (dateFrom) where.startedAt.gte = new Date(dateFrom);
      if (dateTo) where.startedAt.lte = new Date(dateTo + "T23:59:59Z");
    }

    const [counts, totalItems] = await Promise.all([
      prisma.inventoryCount.findMany({
        where,
        include: {
          staff: { select: { id: true, name: true, role: true } },
          _count: { select: { items: true } },
        },
        orderBy: { startedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.inventoryCount.count({ where }),
    ]);

    return { counts, totalItems, totalPages: Math.ceil(totalItems / limit) };
  },

  async getSummary(countId) {
    const items = await prisma.inventoryCountItem.findMany({
      where: { inventoryCountId: countId },
      include: {
        ingredient: { select: { ingredientName: true, unit: true } },
      },
    });

    let totalSystem = 0;
    let totalActual = 0;
    let totalVariance = 0;

    for (const item of items) {
      totalSystem += Number(item.systemQuantity);
      totalActual += Number(item.actualQuantity);
      totalVariance += Number(item.variance);
    }

    return {
      totalItems: items.length,
      totalSystem,
      totalActual,
      totalVariance,
      items,
    };
  },
};
