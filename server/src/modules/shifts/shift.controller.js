import { shiftService } from "./shift.service.js";
import { successResponse, errorResponse } from "../../utils/response.js";
import { AppError } from "../../middleware/errorHandler.middleware.js";

function handleError(res, error, fallbackCode) {
  if (error instanceof AppError) {
    return errorResponse(res, error.message, null, error.statusCode, error.code);
  }
  console.error(`[${fallbackCode}]`, error);
  return errorResponse(res, "Something went wrong", null, 500, fallbackCode);
}

export const shiftController = {
  async startShift(req, res) {
    try {
      const shift = await shiftService.start(req.user.id, req.body);
      return successResponse(res, "Shift started", { shift }, 201);
    } catch (error) {
      return handleError(res, error, "START_SHIFT_ERROR");
    }
  },

  async getActiveShift(req, res) {
    try {
      const shift = await shiftService.getActive(req.user.id);
      return successResponse(res, "Active shift retrieved", { shift });
    } catch (error) {
      return handleError(res, error, "GET_ACTIVE_SHIFT_ERROR");
    }
  },

  async endShift(req, res) {
    try {
      const shift = await shiftService.end(Number(req.params.id), req.user.id, req.body);
      return successResponse(res, "Shift ended", { shift });
    } catch (error) {
      return handleError(res, error, "END_SHIFT_ERROR");
    }
  },

  async getShift(req, res) {
    try {
      const shift = await shiftService.getById(Number(req.params.id));
      return successResponse(res, "Shift retrieved", { shift });
    } catch (error) {
      return handleError(res, error, "GET_SHIFT_ERROR");
    }
  },

  async listShifts(req, res) {
    try {
      const result = await shiftService.list(req.validatedQuery);
      return successResponse(res, "Shifts retrieved", result);
    } catch (error) {
      return handleError(res, error, "LIST_SHIFTS_ERROR");
    }
  },

  async getReconciliation(req, res) {
    try {
      const { date_from, date_to } = req.query;
      const result = await shiftService.getReconciliation(date_from, date_to);
      return successResponse(res, "Reconciliation retrieved", result);
    } catch (error) {
      return handleError(res, error, "RECONCILIATION_ERROR");
    }
  },
};
