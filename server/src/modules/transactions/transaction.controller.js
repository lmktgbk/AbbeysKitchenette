import { transactionService } from "./transaction.service.js";
import { successResponse, errorResponse } from "../../utils/response.js";
import { AppError } from "../../middleware/errorHandler.middleware.js";

/**
 * Transaction Controller (BR-03)
 *
 * Read-only money ledger for admins.
 */

function handleError(res, error, fallbackCode) {
  if (error instanceof AppError) {
    return errorResponse(res, error.message, null, error.statusCode, error.code);
  }
  console.error(`[${fallbackCode}]`, error);
  return errorResponse(res, "Something went wrong", null, 500, fallbackCode);
}

export const transactionController = {
  /**
   * GET /api/transactions
   * Paginated ledger with filters + inflow/outflow/net totals.
   */
  async getLedger(req, res) {
    try {
      const { page, limit, date_from, date_to, method, type, staff_id } = req.validatedQuery;
      const result = await transactionService.getLedger({
        page: Number(page),
        limit: Number(limit),
        dateFrom: date_from,
        dateTo: date_to,
        method,
        type,
        staffId: staff_id,
      });
      return successResponse(res, "Transactions retrieved", result);
    } catch (error) {
      return handleError(res, error, "GET_TRANSACTIONS_ERROR");
    }
  },
};
