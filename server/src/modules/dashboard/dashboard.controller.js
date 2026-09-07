import { dashboardService } from "./dashboard.service.js";
import { successResponse } from "../../utils/response.js";

/**
 * Dashboard Controller
 *
 * Handles HTTP requests for the admin dashboard.
 */
export const dashboardController = {
  /**
   * GET /api/dashboard
   * Returns all dashboard analytics in a single response.
   */
  async getDashboard(req, res) {
    const { dateFrom, dateTo } = req.query;
    const data = await dashboardService.getData(dateFrom || null, dateTo || null);
    return successResponse(res, "Dashboard data retrieved", data);
  },
};
