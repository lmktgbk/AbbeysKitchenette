import { shiftRepository } from "./shift.repository.js";
import { AppError } from "../../middleware/errorHandler.middleware.js";

export const shiftService = {
  async start(staffId, { opening_cash, notes }) {
    const active = await shiftRepository.findActiveByStaff(staffId);
    if (active) {
      throw new AppError(400, "You already have an active shift. End it before starting a new one.", "ACTIVE_SHIFT_EXISTS");
    }
    return shiftRepository.create({ staffId, openingCash: opening_cash, notes });
  },

  async getActive(staffId) {
    return shiftRepository.findActiveByStaff(staffId);
  },

  async end(shiftId, staffId, { actualCash, notes }) {
    const shift = await shiftRepository.findById(shiftId);
    if (!shift) throw new AppError(404, "Shift not found", "SHIFT_NOT_FOUND");
    if (shift.status === "closed") throw new AppError(400, "Shift is already closed", "SHIFT_ALREADY_CLOSED");
    if (shift.staffId !== staffId) throw new AppError(403, "You can only end your own shift", "NOT_YOUR_SHIFT");

    const summary = await shiftRepository.getShiftCashSummary(shiftId);
    const expectedCash = Number(shift.openingCash) + summary.cashSales - summary.cashRefunds;
    const variance = actualCash - expectedCash;

    return shiftRepository.end(shiftId, {
      closingCash: summary.totalSales,
      expectedCash,
      actualCash,
      variance,
      notes,
    });
  },

  async getById(shiftId) {
    const shift = await shiftRepository.findById(shiftId);
    if (!shift) throw new AppError(404, "Shift not found", "SHIFT_NOT_FOUND");
    const summary = await shiftRepository.getShiftCashSummary(shiftId);
    return { ...shift, summary };
  },

  async list(params) {
    const page = Number(params.page) || 1;
    const limit = Number(params.limit) || 20;
    return shiftRepository.findMany({
      page,
      limit,
      dateFrom: params.date_from,
      dateTo: params.date_to,
      staffId: params.staff_id,
      status: params.status,
    });
  },

  async getReconciliation(dateFrom, dateTo) {
    const shifts = await shiftRepository.findMany({
      page: 1,
      limit: 1000,
      dateFrom,
      dateTo,
      status: "closed",
    });

    let totalOpening = 0;
    let totalExpected = 0;
    let totalActual = 0;
    let totalVariance = 0;

    for (const shift of shifts.shifts) {
      totalOpening += Number(shift.openingCash);
      totalExpected += Number(shift.expectedCash || 0);
      totalActual += Number(shift.actualCash || 0);
      totalVariance += Number(shift.variance || 0);
    }

    return {
      totalShifts: shifts.totalItems,
      totalOpening,
      totalExpected,
      totalActual,
      totalVariance,
      shifts: shifts.shifts,
    };
  },
};
