import { z } from "zod";

/**
 * Transaction Validation Schemas (BR-03)
 *
 * Read-only money ledger: payments, refunds, drawer variances.
 */

// GET /api/transactions — paginated ledger with filters
export const getTransactionsQuerySchema = z.object({
  page: z.string().optional().default("1"),
  limit: z
    .string()
    .regex(/^\d+$/, "Limit must be a positive integer")
    .optional()
    .default("20"),
  date_from: z.string().optional(), // YYYY-MM-DD
  date_to: z.string().optional(), // YYYY-MM-DD
  method: z.enum(["all", "cash", "gcash", "maya"]).optional().default("all"),
  type: z.enum(["all", "payment", "refund", "variance"]).optional().default("all"),
  staff_id: z.string().uuid("Invalid staff ID").optional(),
});
