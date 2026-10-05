import { z } from "zod";
import { coercedInteger } from "../../utils/validation.js";

// Accept decimal probability query strings or numeric bodies within [0, 1].
// Restrict string syntax before conversion so arrays and exponent notation do not slip through.
const probabilityQuery = z.union([
  z.string().max(20).regex(/^(?:0(?:\.\d+)?|1(?:\.0+)?)$/),
  z.number().finite().min(0).max(1),
]).transform(Number).optional();

export const mbaAnalyzeQuerySchema = z.object({
  minSupport: probabilityQuery,
  minConfidence: probabilityQuery,
  topN: coercedInteger(100).optional(),
});

export const mbaJobsQuerySchema = z.object({
  limit: coercedInteger(100).optional(),
});

export const mbaJobIdParamSchema = z.object({
  id: coercedInteger(),
});

export const markComboSchema = z.object({
  product_id: z.string().uuid().optional(),
  product_name_a: z.string().trim().min(1).max(150),
  product_name_b: z.string().trim().min(1).max(150),
});
