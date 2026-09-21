import prisma from "../../config/prisma.js";

export const anomalyRepository = {
  async create(data) {
    return prisma.anomalyResult.create({ data });
  },

  async createMany(data) {
    return prisma.anomalyResult.createMany({ data });
  },

  async findMany({ page = 1, limit = 20, severity, category, acknowledged } = {}) {
    const where = {};
    if (severity) where.severity = severity;
    if (category) where.category = category;
    if (acknowledged !== undefined) where.isAcknowledged = acknowledged;

    const [results, totalItems] = await Promise.all([
      prisma.anomalyResult.findMany({
        where,
        orderBy: { detectedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.anomalyResult.count({ where }),
    ]);

    return { results, totalItems };
  },

  async findActive(severities = ["critical", "high"]) {
    return prisma.anomalyResult.findMany({
      where: {
        severity: { in: severities },
        isAcknowledged: false,
      },
      orderBy: { detectedAt: "desc" },
      take: 10,
    });
  },

  async getStats() {
    const [total, bySeverity, byCategory, lastScan] = await Promise.all([
      prisma.anomalyResult.count({ where: { isAcknowledged: false } }),
      prisma.anomalyResult.groupBy({
        by: ["severity"],
        where: { isAcknowledged: false },
        _count: true,
      }),
      prisma.anomalyResult.groupBy({
        by: ["category"],
        where: { isAcknowledged: false },
        _count: true,
      }),
      prisma.anomalyResult.findMany({
        orderBy: { detectedAt: "desc" },
        take: 1,
        select: { detectedAt: true },
      }),
    ]);

    const severityMap = {};
    bySeverity.forEach((s) => { severityMap[s.severity] = s._count; });

    const categoryMap = {};
    byCategory.forEach((c) => { categoryMap[c.category] = c._count; });

    return {
      total,
      bySeverity: severityMap,
      byCategory: categoryMap,
      lastScan: lastScan[0]?.detectedAt || null,
    };
  },

  async acknowledge(id) {
    return prisma.anomalyResult.update({
      where: { id },
      data: { isAcknowledged: true },
    });
  },

  async existsActiveToday(ruleId, ingredientId = null) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const where = { ruleId, isAcknowledged: false, detectedAt: { gte: start } };
    const found = await prisma.anomalyResult.findFirst({ where, select: { id: true } });
    return !!found;
  },

  async existsReviewedSupplier(ingredientId, actualValue) {
    if (!ingredientId) return false;
    const found = await prisma.anomalyResult.findFirst({
      where: { ruleId: "supplier_price_jump", isAcknowledged: true, description: { contains: actualValue } },
      select: { id: true },
    });
    return !!found;
  },

  async deleteOlderThan(days = 90) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    return prisma.anomalyResult.deleteMany({
      where: { detectedAt: { lt: cutoff } },
    });
  },
};
