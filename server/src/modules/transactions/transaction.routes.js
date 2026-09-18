import { Router } from "express";

import { transactionController } from "./transaction.controller.js";
import { validateQuery } from "../../middleware/validate.middleware.js";
import authenticate from "../../middleware/authenticate.middleware.js";
import authorize from "../../middleware/authorize.middleware.js";
import { getTransactionsQuerySchema } from "./transaction.validation.js";

const router = Router();

/**
 * Transaction Routes (BR-03)
 *
 * GET /api/transactions — money ledger (admin only)
 */

router.get(
  "/",
  authenticate,
  authorize("admin"),
  validateQuery(getTransactionsQuerySchema),
  transactionController.getLedger,
);

export default router;
