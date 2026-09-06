import { staffService } from "./staff.service.js";
import { successResponse } from "../../utils/response.js";
import { AppError } from "../../middleware/errorHandler.middleware.js";

/**
 * Staff Controller
 *
 * HTTP request handlers for staff management.
 * Each method wraps service calls with error handling.
 */

function handleError(res, error, fallbackCode) {
  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      success: false,
      message: error.message,
      error: error.code,
      data: null,
    });
  }
  console.error("Staff error:", error);
  return res.status(500).json({
    success: false,
    message: "Internal server error",
    error: fallbackCode,
    data: null,
  });
}

export const staffController = {
  /**
   * GET /api/staff — list staff with pagination, search, filter, sort
   */
  async getStaffList(req, res) {
    try {
      const result = await staffService.listStaff(req.validatedQuery);
      return successResponse(res, "Staff list retrieved", result);
    } catch (error) {
      return handleError(res, error, "STAFF_LIST_ERROR");
    }
  },

  /**
   * GET /api/staff/performance — performance metrics
   */
  async getPerformance(req, res) {
    try {
      const result = await staffService.getPerformance(req.validatedQuery);
      return successResponse(res, "Performance metrics retrieved", {
        performance: result,
      });
    } catch (error) {
      return handleError(res, error, "PERFORMANCE_ERROR");
    }
  },

  /**
   * GET /api/staff/:id — single staff detail
   */
  async getStaff(req, res) {
    try {
      const staff = await staffService.getStaff(req.params.id);
      return successResponse(res, "Staff retrieved", { staff });
    } catch (error) {
      return handleError(res, error, "STAFF_FETCH_ERROR");
    }
  },

  /**
   * POST /api/staff — create staff
   */
  async createStaff(req, res) {
    try {
      const result = await staffService.createStaff(req.body, req.user.id);
      return successResponse(res, "Staff created", result, 201);
    } catch (error) {
      return handleError(res, error, "STAFF_CREATE_ERROR");
    }
  },

  /**
   * PATCH /api/staff/:id — update staff
   */
  async updateStaff(req, res) {
    try {
      const staff = await staffService.updateStaff(req.params.id, req.body, req.user.id);
      return successResponse(res, "Staff updated", { staff });
    } catch (error) {
      return handleError(res, error, "STAFF_UPDATE_ERROR");
    }
  },

  /**
   * PATCH /api/staff/:id/toggle-active — activate/deactivate
   */
  async toggleActive(req, res) {
    try {
      const result = await staffService.toggleActive(req.params.id, req.user.id);
      return successResponse(res, "Staff status toggled", result);
    } catch (error) {
      return handleError(res, error, "STAFF_TOGGLE_ERROR");
    }
  },

  /**
   * POST /api/staff/:id/reset-pin — reset PIN
   */
  async resetPin(req, res) {
    try {
      const result = await staffService.resetPin(
        req.params.id,
        req.body.new_pin,
        req.user.id,
      );
      return successResponse(res, "PIN reset successfully", result);
    } catch (error) {
      return handleError(res, error, "STAFF_RESET_PIN_ERROR");
    }
  },

  /**
   * POST /api/staff/:id/reset-password — reset password
   */
  async resetPassword(req, res) {
    try {
      const result = await staffService.resetPassword(
        req.params.id,
        req.body.new_password,
        req.user.id,
      );
      return successResponse(res, "Password reset successfully", result);
    } catch (error) {
      return handleError(res, error, "STAFF_RESET_PWD_ERROR");
    }
  },

  /**
   * DELETE /api/staff/:id — hard delete
   */
  async deleteStaff(req, res) {
    try {
      const result = await staffService.deleteStaff(req.params.id, req.user.id);
      return successResponse(res, "Staff deleted", result);
    } catch (error) {
      return handleError(res, error, "STAFF_DELETE_ERROR");
    }
  },
};
