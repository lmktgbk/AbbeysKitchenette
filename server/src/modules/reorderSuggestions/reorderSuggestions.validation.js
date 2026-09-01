import { z } from "zod";

/**
 * Reorder Suggestions Validation Schemas
 */

// Used by POST /api/reorder-suggestions/:id/accept and /:id/reject
export const idParamSchema = z.object({
  id: z.string().uuid("Invalid suggestion ID"),
});
