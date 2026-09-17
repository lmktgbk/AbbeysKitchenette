import { shiftRepository } from "./shift.repository.js";
import { AppError } from "../../middleware/errorHandler.middleware.js";
import { auditLogService } from "../auditLogs/auditLog.service.js";
import { ACTIONS } from "../auditLogs/auditLog.constants.js";
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
    // Strip the window-function count before formatting.
    const shifts = rows.map(({ total_count, ...row }) => formatShift(row));
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

    const [sales, refunds] = await Promise.all([
      shiftRepository.getShiftSales(shiftId, openedAt, closedAt),
      shiftRepository.getShiftCashRefunds(shiftId),
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

    return {
      ...formatShift(closed),
      summary: await this.buildSummary(closed),
    };
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
