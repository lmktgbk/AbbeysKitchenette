import { orderService } from "./order.service.js";
import { successResponse, errorResponse } from "../../utils/response.js";
import { AppError } from "../../middleware/errorHandler.middleware.js";

/**
 * Order Controller
 *
 * Handles HTTP requests for order operations.
 * Uses handleError to standardize error responses.
 */

function handleError(res, error, fallbackCode) {
  if (error instanceof AppError) {
    return errorResponse(res, error.message, null, error.statusCode, error.code);
  }
  console.error(`[${fallbackCode}]`, error);
  return errorResponse(res, "Something went wrong", null, 500, fallbackCode);
}

export const orderController = {
  /**
   * GET /api/orders
   * Paginated order list with filters.
   */
  async getOrders(req, res) {
    try {
      const { page, limit, search, status, date_from, date_to, sortBy, sortDir } = req.validatedQuery;
      const result = await orderService.getAll({
        page: Number(page),
        limit: Number(limit),
        search,
        status,
        dateFrom: date_from,
        dateTo: date_to,
        sortBy,
        sortDir,
      });
      return successResponse(res, "Orders retrieved", result);
    } catch (error) {
      return handleError(res, error, "GET_ORDERS_ERROR");
    }
  },

  /**
   * GET /api/orders/stats
   * Status counts for KPI cards.
   */
  async getStats(req, res) {
    try {
      const stats = await orderService.getStats();
      return successResponse(res, "Stats retrieved", { stats });
    } catch (error) {
      return handleError(res, error, "GET_STATS_ERROR");
    }
  },

  /**
   * GET /api/orders/:id
   * Single order detail with items + timeline.
   */
  async getOrder(req, res) {
    try {
      const order = await orderService.getById(req.params.id);
      return successResponse(res, "Order retrieved", { order });
    } catch (error) {
      return handleError(res, error, "GET_ORDER_ERROR");
    }
  },

  /**
   * POST /api/orders
   * Create walk-in order (auto-accepted, ingredients deducted).
   */
  async createOrder(req, res) {
    try {
      const { customer_name, table_number, items, amount_paid, order_date } = req.body;
      const order = await orderService.createWalkIn({
        customerName: customer_name,
        tableNumber: table_number,
        items,
        amountPaid: amount_paid,
        createdBy: req.user.id,
        orderDate: order_date,
      });
      return successResponse(res, "Order created", { order }, 201);
    } catch (error) {
      return handleError(res, error, "CREATE_ORDER_ERROR");
    }
  },

  /**
   * PUT /api/orders/:id
   * Edit pending order (items + name + table).
   */
  async updateOrder(req, res) {
    try {
      const order = await orderService.editPending(req.params.id, req.body);
      return successResponse(res, "Order updated", { order });
    } catch (error) {
      return handleError(res, error, "UPDATE_ORDER_ERROR");
    }
  },

  /**
   * PUT /api/orders/:id/status
   * Advance order status (one step).
   */
  async updateStatus(req, res) {
    try {
      const { status, amount_paid } = req.body;
      const order = await orderService.advanceStatus(req.params.id, status, {
        userId: req.user.id,
        amountPaid: amount_paid,
      });
      return successResponse(res, "Order status updated", { order });
    } catch (error) {
      return handleError(res, error, "UPDATE_STATUS_ERROR");
    }
  },

  /**
   * POST /api/orders/:id/cancel
   * Delete (pending) or cancel + restore (accepted/next_in_line).
   */
  async cancelOrder(req, res) {
    try {
      const { reason } = req.body || {};
      const result = await orderService.cancelOrDelete(req.params.id, req.user.id, reason);
      return successResponse(res, result.action === "deleted" ? "Order deleted" : "Order cancelled", result);
    } catch (error) {
      return handleError(res, error, "CANCEL_ORDER_ERROR");
    }
  },
};
