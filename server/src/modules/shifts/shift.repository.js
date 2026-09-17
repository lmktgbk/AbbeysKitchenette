import prisma from "../../config/prisma.js";

export const shiftRepository = {
  async findActiveByStaff(staffId) {
    return prisma.shift.findFirst({
      where: { staffId, status: "active" },
      orderBy: { startedAt: "desc" },
    });
  },

  async create({ staffId, openingCash, notes }) {
    return prisma.shift.create({
      data: {
        staffId,
        openingCash,
        notes: notes || null,
        status: "active",
      },
    });
  },

  async end(shiftId, { closingCash, expectedCash, actualCash, variance, notes }) {
    return prisma.shift.update({
      where: { shiftId },
      data: {
        status: "closed",
        closingCash,
        expectedCash,
        actualCash,
        variance,
        endedAt: new Date(),
        notes: notes || undefined,
      },
    });
  },

  async findById(shiftId) {
    return prisma.shift.findUnique({
      where: { shiftId },
      include: {
        staff: { select: { id: true, name: true, role: true } },
        orders: {
          select: {
            orderId: true,
            orderNumber: true,
            totalAmount: true,
            amountPaid: true,
            change: true,
            paymentMethod: true,
            status: true,
            createdAt: true,
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });
  },

  async findMany({ page, limit, dateFrom, dateTo, staffId, status }) {
    const where = {};
    if (staffId) where.staffId = staffId;
    if (status) where.status = status;
    if (dateFrom || dateTo) {
      where.startedAt = {};
      if (dateFrom) where.startedAt.gte = new Date(dateFrom);
      if (dateTo) where.startedAt.lte = new Date(dateTo + "T23:59:59Z");
    }

    const [shifts, totalItems] = await Promise.all([
      prisma.shift.findMany({
        where,
        include: {
          staff: { select: { id: true, name: true, role: true } },
          _count: { select: { orders: true } },
        },
        orderBy: { startedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.shift.count({ where }),
    ]);

    return { shifts, totalItems, totalPages: Math.ceil(totalItems / limit) };
  },

  async getShiftCashSummary(shiftId) {
    const orders = await prisma.order.findMany({
      where: {
        shiftId,
        status: { in: ["accepted", "preparing", "completed"] },
      },
      select: {
        totalAmount: true,
        amountPaid: true,
        paymentMethod: true,
        change: true,
        discountAmount: true,
      },
    });

    const refunds = await prisma.paymentRefund.findMany({
      where: {
        order: { shiftId },
      },
      select: { amount: true },
    });

    const cashOrders = orders.filter((o) => o.paymentMethod === "cash");
    const cashSales = cashOrders.reduce((sum, o) => sum + Number(o.totalAmount), 0);
    const cashRefunds = refunds.reduce((sum, r) => sum + Number(r.amount), 0);
    const totalSales = orders.reduce((sum, o) => sum + Number(o.totalAmount), 0);
    const totalDiscounts = orders.reduce((sum, o) => sum + Number(o.discountAmount || 0), 0);

    return {
      totalOrders: orders.length,
      totalSales,
      totalDiscounts,
      cashSales,
      cashRefunds,
      paymentBreakdown: Object.entries(
        orders.reduce((acc, o) => {
          const method = o.paymentMethod || "cash";
          if (!acc[method]) acc[method] = { amount: 0, transactions: 0 };
          acc[method].amount += Number(o.totalAmount);
          acc[method].transactions += 1;
          return acc;
        }, {})
      ).map(([method, data]) => ({ method, ...data })),
    };
  },
};
