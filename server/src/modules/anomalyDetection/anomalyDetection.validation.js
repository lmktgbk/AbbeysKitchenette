import { z } from "zod";
import { LIMITS, coercedInteger } from "../../utils/validation.js";

export const anomalyQuerySchema = z.object({
  page: coercedInteger(LIMITS.page).optional().default(1),
  limit: coercedInteger(LIMITS.pageSize).optional().default(20),
  severity: z.enum(["critical", "high", "medium", "low"]).optional(),
  category: z.enum(["revenue", "loss", "cancellation", "fulfillment", "refund", "discount", "cash", "restock", "stockout", "supplier", "payment", "sales_hours"]).optional(),
  // Explicit string mapping — z.coerce.boolean() turns the query string
  // "false" into TRUE (any non-empty string is truthy), which inverted the
  // Active inbox to show reviewed items. Never use coerce.boolean on query.
  acknowledged: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
});

export const activeAnomalyQuerySchema = z.object({
  severity: z.string().max(50).refine(value => value.split(",").every(x => ["critical", "high", "medium", "low"].includes(x.trim())), "Invalid severity filter").optional().default("critical,high"),
});

export const anomalyIdParamSchema = z.object({
  id: z.string().uuid("Invalid anomaly ID"),
});
