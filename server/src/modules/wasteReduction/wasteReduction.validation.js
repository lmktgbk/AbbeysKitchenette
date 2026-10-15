import { z } from "zod";
import { coercedInteger } from "../../utils/validation.js";

/**
 * Waste Reduction Validation Schemas
 */

// Used by POST /api/waste-reduction/:id/accept and /:id/reject
export const idParamSchema = z.object({
  id: z.string().uuid("Invalid insight ID"),
});
export const batchActionParamSchema = idParamSchema.extend({ batchId: coercedInteger() });
