import { z } from "zod/v4";

export const mbaAnalyzeQuerySchema = z.object({
  minSupport: z.coerce.number().min(0).max(1).optional(),
  minConfidence: z.coerce.number().min(0).max(1).optional(),
  topN: z.coerce.number().int().positive().max(100).optional(),
});

export const mbaJobsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional(),
});

export const mbaJobIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});
