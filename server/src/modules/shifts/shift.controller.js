import { shiftService } from "./shift.service.js";
import { successResponse, errorResponse } from "../../utils/response.js";
import { AppError } from "../../middleware/errorHandler.middleware.js";

/**
 * Shift Controller
 *
 * HTTP handlers for cashier drawer sessions.
 */

function handleError(res, error, fallbackCode) {
  if (error instanceof AppError) {
    return errorResponse(res, error.message, null, error.statusCode, error.code);
  }
  console.error(`[${fallbackCode}]`, error);
  return errorResponse(res, "Something went wrong", null, 500, fallbackCode);
}

export const shiftController = {
  /**
   * POST /api/shifts/open
   * Open a drawer session with declared opening cash.
   */
  async openShift(req, res) {
    try {
      const { opening_cash } = req.body;
      const shift = await shiftService.openShift({
        openingCash: opening_cash,
        userId: req.user.id,
      });
      return successResponse(res, "Shift opened", { shift }, 201);
    } catch (error) {
      return handleError(res, error, "OPEN_SHIFT_ERROR");
    }
  },

  /**
   * GET /api/shifts/mine
   * Cashier's open shifts with live summaries.
   */
  async getMine(req, res) {
    try {
      const result = await shiftService.getMine(req.user.id);
      return successResponse(res, "Open shifts retrieved", result);
    } catch (error) {
      return handleError(res, error, "GET_MY_SHIFTS_ERROR");
    }
  },

  /**
   * GET /api/shifts/mine/history
   * Cashier's own closed shifts (personal history).
   */
  async getMyHistory(req, res) {
    try {
      const result = await shiftService.getMyHistory(req.user.id);
      return successResponse(res, "Shift history retrieved", result);
    } catch (error) {
      return handleError(res, error, "GET_MY_SHIFT_HISTORY_ERROR");
    }
  },

  /**
   * GET /api/shifts/:id/orders
   * Orders attributed to one shift (owner/admin).
   */
  async getShiftOrders(req, res) {
    try {
      const { page, limit, status } = req.validatedQuery;
      const result = await shiftService.getShiftOrders(req.params.id, {
        userId: req.user.id,
        role: req.user.role,
        page: Number(page),
        limit: Number(limit),
        status,
      });
      return successResponse(res, "Shift orders retrieved", result);
    } catch (error) {
      return handleError(res, error, "GET_SHIFT_ORDERS_ERROR");
    }
  },

  /**
   * GET /api/shifts/stats
   * Admin: period aggregates for the Shifts KPI row.
   */
  async getStats(req, res) {
    try {
      const { date_from, date_to } = req.validatedQuery;
      const stats = await shiftService.getStats({ dateFrom: date_from, dateTo: date_to });
      return successResponse(res, "Shift stats retrieved", { stats });
    } catch (error) {
      return handleError(res, error, "GET_SHIFT_STATS_ERROR");
    }
  },

  /**
   * GET /api/shifts
   * Admin: paginated shift list with filters.
   */
  async getShifts(req, res) {
    try {
      const { page, limit, status, staff_id, date_from, date_to } = req.validatedQuery;
      const result = await shiftService.list({
        page: Number(page),
        limit: Number(limit),
        status,
        staffId: staff_id,
        dateFrom: date_from,
        dateTo: date_to,
      });
      return successResponse(res, "Shifts retrieved", result);
    } catch (error) {
      return handleError(res, error, "GET_SHIFTS_ERROR");
    }
  },

  /**
   * GET /api/shifts/:id
   * Single shift with reconciliation summary.
   */
  async getShift(req, res) {
    try {
      const shift = await shiftService.getById(req.params.id, {
        userId: req.user.id,
        role: req.user.role,
      });
      return successResponse(res, "Shift retrieved", { shift });
    } catch (error) {
      return handleError(res, error, "GET_SHIFT_ERROR");
    }
  },

  /**
   * GET /api/shifts/:id/summary
   * Reconciliation breakdown (review-before-close step).
   */
  async getSummary(req, res) {
    try {
      const result = await shiftService.getSummary(req.params.id, {
        userId: req.user.id,
        role: req.user.role,
      });
      return successResponse(res, "Summary retrieved", result);
    } catch (error) {
      return handleError(res, error, "GET_SHIFT_SUMMARY_ERROR");
    }
  },

  /**
   * POST /api/shifts/:id/close
   * End own shift with declared actual cash.
   */
  async closeShift(req, res) {
    try {
      const { actual_cash, close_note } = req.body;
      const shift = await shiftService.closeShift({
        id: req.params.id,
        actualCash: actual_cash,
        closeNote: close_note,
        userId: req.user.id,
      });
      return successResponse(res, "Shift closed", { shift });
    } catch (error) {
      return handleError(res, error, "CLOSE_SHIFT_ERROR");
    }
  },

  /**
   * POST /api/shifts/:id/force-close
   * Admin: end someone else's shift (note required).
   */
  async forceCloseShift(req, res) {
    try {
      const { actual_cash, close_note } = req.body;
      const shift = await shiftService.closeShift({
        id: req.params.id,
        actualCash: actual_cash,
        closeNote: close_note,
        userId: req.user.id,
        forced: true,
      });
      return successResponse(res, "Shift force-closed", { shift });
    } catch (error) {
      return handleError(res, error, "FORCE_CLOSE_SHIFT_ERROR");
    }
  },
};
