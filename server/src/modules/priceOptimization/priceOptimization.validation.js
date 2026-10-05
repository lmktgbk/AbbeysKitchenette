import { z } from "zod";
import { queryInteger } from "../../utils/validation.js";

// Product IDs are UUIDs; persisted suggestion IDs below are bounded integer
// strings. Keep these distinct identities at their respective HTTP boundaries.
export const generateSchema = z.object({
  productId: z.string().uuid("Invalid product ID"),
});

export const idParamSchema = z.object({
  id: queryInteger(),
});
