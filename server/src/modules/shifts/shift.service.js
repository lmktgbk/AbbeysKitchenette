import { shiftRepository } from "./shift.repository.js";
import { AppError } from "../../middleware/errorHandler.middleware.js";
import { auditLogService } from "../auditLogs/auditLog.service.js";
import { ACTIONS } from "../auditLogs/auditLog.constants.js";
import { anomalyService } from "../anomalyDetection/anomalyDetection.service.js";
import prisma from "../../config/prisma.js";

function roundMoney(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function formatShift(row) {
  if (!row) return null;
  return {
    shift_id: row.shiftId ?? row.shift_id,
    opened_by: row.openedBy ?? row.opened_by,
    opener_name: row.opener?.name ?? row.opener_name ?? null,
    opened_at: row.openedAt ?? row.opened_at,
    opening_cash: Number(row.openingCash ?? row.opening_cash ?? 0),
    status: row.status,
    closed_at: row.closedAt ?? row.closed_at ?? null,
    closed_by: row.closedBy ?? row.closed_by ?? null,
    closer_name: row.closer?.name ?? row.closer_name ?? null,
    expected_cash: row.expectedCash != null ? Number(row.expectedCash) : (row.expected_cash != null ? Number(row.expected_cash) : null),
    actual_cash: row.actualCash != null ? Number(row.actualCash) : (row.actual_cash != null ? Number(row.actual_cash) : null),
    variance: row.variance != null ? Number(row.variance) : null,
    close_note: row.closeNote ?? row.close_note ?? null,
  };
}

export const shiftService = {
  /* ── Open ──────────────────────────────── */

  async openShift({ openingCash, userId }) {
    if (!Number.isFinite(Number(openingCash)) || Number(openingCash) < 0) {
      throw new AppError(400, "Opening cash is required and must be non-negative", "INVALID_OPENING_CASH");
    }

    // One open shift per cashier — close the current one first.
    const mine = await shiftRepository.findOpenByUser(userId);
    if (mine.length > 0) {
      throw new AppError(409, "Close your current shift before opening a new one", "SHIFT_ALREADY_OPEN");
    }

    const shift = await shiftRepository.create({
      openingCash: roundMoney(openingCash),
      openedBy: userId,
    });

    auditLogService.logAction({
      userId,
      action: ACTIONS.SHIFT_OPENED,
      targetType: "shift",
      targetId: shift.shiftId,
      details: { openingCash: Number(openingCash) },
    }).catch(() => {});

    return formatShift(shift);
  },

  /* ── Read ──────────────────────────────── */

  async getMine(userId) {
    const rows = await shiftRepository.findOpenByUser(userId);
    const withSummary = await Promise.all(
      rows.map(async (s) => ({ ...formatShift(s), ...(await this.buildSummary(s)) })),
    );
    return { shifts: withSummary };
  },

  /**
   * Cashier's own closed shifts (personal history, latest first).
   */
  async getMyHistory(userId, limit = 20) {
    const rows = await shiftRepository.findClosedByUser(userId, limit);
    const withSummary = await Promise.all(
      rows.map(async (s) => ({ ...formatShift(s), ...(await this.buildSummary(s)) })),
    );
    return { shifts: withSummary };
  },

  /**
   * Orders attributed to one shift (owner or admin only), windowed.
   */
  async getShiftOrders(id, { userId, role, page = 1, limit = 15, status = "all" }) {
    const shift = await shiftRepository.findById(id);
    if (!shift) throw new AppError(404, "Shift not found", "SHIFT_NOT_FOUND");
    if (role !== "admin" && shift.openedBy !== userId) {
      throw new AppError(403, "You can only view your own shifts", "FORBIDDEN");
    }
    const take = Math.min(Math.max(Number(limit) || 15, 1), 50);
    const pageNum = Math.max(Number(page) || 1, 1);
    const skip = (pageNum - 1) * take;
    const [orders, totalOrders] = await Promise.all([
      shiftRepository.findOrdersByShift(id, { skip, take, status }),
      shiftRepository.countOrdersByShift(id, status),
    ]);
    return {
      shift: formatShift(shift),
      totalOrders,
      page: pageNum,
      limit: take,
      orders: orders.map((o) => ({
        order_id: o.orderId,
        order_number: o.orderNumber,
        customer_name: o.customerName,
        table_number: o.tableNumber,
        order_source: o.orderSource,
        status: o.status,
        payment_method: o.paymentMethod,
        total_amount: Number(o.totalAmount),
        amount_paid: o.amountPaid != null ? Number(o.amountPaid) : null,
        accepted_at: o.acceptedAt,
        items: o.items.map((i) => ({
          product_name: i.product?.productName ?? null,
          size_name: i.variant?.sizeName ?? null,
          quantity: i.quantity,
          subtotal: i.subtotal != null ? Number(i.subtotal) : null,
        })),
      })),
    };
  },

  async getById(id, { userId, role }) {
    const shift = await shiftRepository.findById(id);
    if (!shift) throw new AppError(404, "Shift not found", "SHIFT_NOT_FOUND");
    if (role !== "admin" && shift.openedBy !== userId) {
      throw new AppError(403, "You can only view your own shifts", "FORBIDDEN");
    }
    return { ...formatShift(shift), ...(await this.buildSummary(shift)) };
  },

  async list({ page = 1, limit = 20, status, staffId, dateFrom, dateTo }) {
    const skip = (page - 1) * limit;
    const [rows, totalItems] = await Promise.all([
      shiftRepository.findManyPaginated({ skip, take: limit, status, staffId, dateFrom, dateTo }),
      shiftRepository.countFiltered({ status, staffId, dateFrom, dateTo }),
    ]);
    // Strip the window-function count; open rows get live summaries
    // so admin cards show current expected cash, not NULL.
    const shifts = await Promise.all(
      rows.map(async ({ total_count, ...row }) => {
        const base = formatShift(row);
        if (base.status !== "open") return base;
        const full = await shiftRepository.findById(base.shift_id);
        return { ...base, ...(await this.buildSummary(full ?? row)) };
      }),
    );
    return { shifts, totalItems };
  },

  /* ── Summary math ──────────────────────── */

  /**
   * Reconciliation breakdown for a shift.
   * Aggregates always recompute live (orders never move between
   * shifts); expected/actual/variance come from the stored snapshot
   * once closed, otherwise expected derives from the math below.
   * expected = opening + cash sales − cash refunds.
   */
  async buildSummary(shift) {
    const openedAt = shift.openedAt ?? shift.opened_at;
    const closedAt = shift.closedAt ?? shift.closed_at ?? null;
    const openingCash = Number(shift.openingCash ?? shift.opening_cash ?? 0);
    const shiftId = shift.shiftId ?? shift.shift_id;
    const closed = (shift.status ?? "open") === "closed";

    const [sales, refunds, openOrders] = await Promise.all([
      shiftRepository.getShiftSales(shiftId, openedAt, closedAt),
      shiftRepository.getShiftCashRefunds(shiftId, openedAt, closedAt),
      shiftRepository.getShiftOpenOrders(shiftId, openedAt, closedAt),
    ]);
    const computed = roundMoney(openingCash + sales.cashSales - refunds.cashRefunds);
    const stored = (v) => (v != null ? Number(v) : null);
    return {
      opening_cash: openingCash,
      cash_sales: roundMoney(sales.cashSales),
      cash_orders: sales.cashOrders,
      cash_refunds: roundMoney(refunds.cashRefunds),
      refund_count: refunds.refundCount,
      gcash_sales: roundMoney(sales.gcashSales),
      maya_sales: roundMoney(sales.mayaSales),
      total_orders: sales.totalOrders,
      open_orders: openOrders.openCount,
      open_orders_total: roundMoney(openOrders.openTotal),
      expected_cash: closed
        ? (stored(shift.expectedCash) ?? stored(shift.expected_cash) ?? computed)
        : computed,
      actual_cash: closed ? (stored(shift.actualCash) ?? stored(shift.actual_cash)) : null,
      variance: closed ? (stored(shift.variance) ?? null) : null,
    };
  },

  async getSummary(id, { userId, role }) {
    const shift = await shiftRepository.findById(id);
    if (!shift) throw new AppError(404, "Shift not found", "SHIFT_NOT_FOUND");
    if (role !== "admin" && shift.openedBy !== userId) {
      throw new AppError(403, "You can only view your own shifts", "FORBIDDEN");
    }
    return { shift: formatShift(shift), summary: await this.buildSummary(shift) };
  },

  async getIngredientUsage(id, { userId, role }) {
    const shift = await shiftRepository.findById(id);
    if (!shift) throw new AppError(404, "Shift not found", "SHIFT_NOT_FOUND");
    if (role !== "admin" && shift.openedBy !== userId) {
      throw new AppError(403, "You can only view your own shifts", "FORBIDDEN");
    }

    const orders = await prisma.order.findMany({
      where: {
        shiftId: id,
        status: { in: ["accepted", "preparing", "completed"] },
      },
      include: {
        items: {
          include: {
            product: {
              include: {
                subcategory: {
                  include: {
                    category: true,
                  },
                },
              },
            },
            variant: {
              include: {
                recipes: {
                  include: {
                    ingredient: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    const cashierMap = new Map();
    const kitchenMap = new Map();

    for (const order of orders) {
      for (const item of order.items) {
        if (!item.product || !item.variant) continue;
        
        const categoryName = item.product.subcategory?.category?.categoryName;
        const isBeverage = categoryName === "Beverages";
        
        const targetMap = isBeverage ? cashierMap : kitchenMap;

        for (const recipe of item.variant.recipes) {
          if (!recipe.ingredient) continue;
          
          const ingredientName = recipe.ingredient.ingredientName;
          const unit = recipe.ingredient.unit;
          const qtyUsed = Number(recipe.quantityNeeded) * item.quantity;
          
          if (!targetMap.has(ingredientName)) {
            targetMap.set(ingredientName, { name: ingredientName, unit, total: 0 });
          }
          targetMap.get(ingredientName).total += qtyUsed;
        }
      }
    }

    const formatMap = (map) => Array.from(map.values())
      .map(i => ({ ...i, total: roundMoney(i.total) }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return {
      cashierIngredients: formatMap(cashierMap),
      kitchenIngredients: formatMap(kitchenMap),
    };
  },

  /* ── Close ─────────────────────────────── */

  async closeShift({ id, actualCash, closeNote, userId, forced = false }) {
    const shift = await shiftRepository.findById(id);
    if (!shift) throw new AppError(404, "Shift not found", "SHIFT_NOT_FOUND");
    if (shift.status !== "open") {
      throw new AppError(400, "Shift is already closed", "SHIFT_ALREADY_CLOSED");
    }
    if (!forced && shift.openedBy !== userId) {
      throw new AppError(403, "Only the opener or an admin can close this shift", "FORBIDDEN");
    }
    if (!Number.isFinite(Number(actualCash)) || Number(actualCash) < 0) {
      throw new AppError(400, "Actual cash count is required and must be non-negative", "INVALID_ACTUAL_CASH");
    }

    const summary = await this.buildSummary(shift);
    const expected = summary.expected_cash;
    const actual = roundMoney(actualCash);
    const variance = roundMoney(actual - expected);

    if (variance !== 0 && !closeNote?.trim()) {
      throw new AppError(400, "A note is required when actual cash differs from expected", "VARIANCE_NOTE_REQUIRED");
    }
    if (forced && !closeNote?.trim()) {
      throw new AppError(400, "A note is required for force-close", "NOTE_REQUIRED");
    }

    const closed = await prisma.$transaction(async (tx) => {
      return shiftRepository.close(id, {
        expectedCash: expected,
        actualCash: actual,
        variance,
        closeNote: closeNote?.trim() || null,
        closedBy: userId,
      }, tx);
    });

    auditLogService.logAction({
      userId,
      action: forced ? ACTIONS.SHIFT_FORCE_CLOSED : ACTIONS.SHIFT_CLOSED,
      targetType: "shift",
      targetId: id,
      details: { expected, actual, variance },
    }).catch(() => {});

    // Real-time anomaly hook: cash variance (fire-and-forget, only when off)
    if (variance !== 0) {
      anomalyService.runScan(["shift_variance_spike"]).catch(() => {});
    }

    return {
      ...formatShift(closed),
      summary: await this.buildSummary(closed),
    };
  },

  /**
   * Period stats for the Shifts KPI row (default: today, local).
   * Same drawer math as the cards — KPIs can never disagree with them.
   */
  async getStats({ dateFrom, dateTo }) {
    const today = new Date().toISOString().split("T")[0];
    const fromStr = dateFrom || today;
    const toStr = dateTo || fromStr;
    const from = new Date(`${fromStr}T00:00:00`);
    const to = new Date(`${toStr}T23:59:59.999`);
    const stats = await shiftRepository.getStats(from, to);
    return { ...stats, date_from: fromStr, date_to: toStr };
  },

  /* ── Guard for order payment flows ─────── */

  /**
   * Resolve the drawer session a payment belongs to.
   * One open shift per cashier: returns it, or throws
   * SHIFT_REQUIRED when none is open.
   * @returns {{ shiftId }}
   */
  async resolveShiftForUser(userId) {
    const open = await shiftRepository.findOpenByUser(userId);
    if (open.length === 0) {
      throw new AppError(409, "Open a shift before taking payments", "SHIFT_REQUIRED");
    }
    return { shiftId: open[0].shiftId };
  },
};
