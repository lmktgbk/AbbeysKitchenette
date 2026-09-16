import { z } from "zod/v4";

export const anomalyQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  severity: z.enum(["critical", "high", "medium", "low"]).optional(),
  category: z.enum(["revenue", "loss", "cancellation", "fulfillment"]).optional(),
  acknowledged: z.coerce.boolean().optional(),
});

export const activeAnomalyQuerySchema = z.object({
  severity: z.string().optional().default("critical,high"),
});
