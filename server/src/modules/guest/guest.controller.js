import { guestService } from "./guest.service.js";
import { successResponse, errorResponse } from "../../utils/response.js";
import { AppError } from "../../middleware/errorHandler.middleware.js";

/**
 * Guest Controller
 *
 * Public endpoints for customer-facing operations.
 */

function handleError(res, error, fallbackCode) {
  if (error instanceof AppError) {
    return errorResponse(res, error.message, null, error.statusCode, error.code);
  }
  console.error(`[${fallbackCode}]`, error);
  return errorResponse(res, "Something went wrong", null, 500, fallbackCode);
}

export const guestController = {
  /**
   * GET /api/guest/menu
   * Available products for the customer menu.
   */
  async getMenu(req, res) {
    try {
      const { search, category } = req.validatedQuery || {};
      const menu = await guestService.getMenu({ search, category });
      return successResponse(res, "Menu retrieved", { menu });
    } catch (error) {
      return handleError(res, error, "GET_MENU_ERROR");
    }
  },

  /**
   * POST /api/guest/orders
   * Place an online order (status: pending).
   */
  async placeOrder(req, res) {
    try {
      const { customer_name, table_number, items } = req.body;
      const order = await guestService.placeOrder({
        customerName: customer_name,
        tableNumber: table_number,
        items,
      });
      return successResponse(res, "Order placed", { order }, 201);
    } catch (error) {
      return handleError(res, error, "PLACE_ORDER_ERROR");
    }
  },
};
