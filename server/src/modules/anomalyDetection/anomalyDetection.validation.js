import { z } from "zod/v4";

export const anomalyQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
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
  severity: z.string().optional().default("critical,high"),
});

export const anomalyIdParamSchema = z.object({
  id: z.string().uuid("Invalid anomaly ID"),
});
