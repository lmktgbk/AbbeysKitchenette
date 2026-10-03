import { z } from "zod";
import { pageQuery, limitQuery, calendarDate, withDateRange } from "../../utils/validation.js";

/**
 * Transaction Validation Schemas (BR-03)
 *
 * Read-only money ledger: payments, refunds, drawer variances.
 */

// GET /api/transactions — paginated ledger with filters
export const getTransactionsQuerySchema = withDateRange(z.object({
  page: pageQuery,
  limit: limitQuery("20"),
  date_from: calendarDate.optional(), // YYYY-MM-DD
  date_to: calendarDate.optional(), // YYYY-MM-DD
  method: z.enum(["all", "cash", "gcash", "maya"]).optional().default("all"),
  type: z.enum(["all", "payment", "refund", "variance"]).optional().default("all"),
  staff_id: z.string().uuid("Invalid staff ID").optional(),
}));
