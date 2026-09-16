import { guestService } from "./guest.service.js";
import { successResponse, errorResponse } from "../../utils/response.js";
import { AppError } from "../../middleware/errorHandler.middleware.js";
import { settingsRepository } from "../settings/settings.repository.js";
import { isStoreOpen } from "../../utils/storeHours.js";

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
   * GET /api/guest/settings
   * Public store settings for the landing page.
   */
  async getStoreSettings(req, res) {
    try {
      const settings = await settingsRepository.find();
      return successResponse(res, "Store settings retrieved", {
        storeName: settings?.storeName || "Abbey's Kitchenette",
        storeAddress: settings?.storeAddress || "",
        storePhone: settings?.storePhone || "",
        storeEmail: settings?.storeEmail || "",
        storeHours: settings?.storeHours || null,
      });
    } catch (error) {
      return handleError(res, error, "GET_STORE_SETTINGS_ERROR");
    }
  },

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
      const settings = await settingsRepository.find();
      const { isOpen } = isStoreOpen(settings?.storeHours);
      if (!isOpen) {
        return errorResponse(
          res,
          "Store is currently closed. Please try again during store hours.",
          null,
          403,
          "STORE_CLOSED"
        );
      }

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
