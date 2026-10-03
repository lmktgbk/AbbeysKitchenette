import { z } from "zod";
import { queryInteger } from "../../utils/validation.js";

export const generateSchema = z.object({
  productId: z.string().uuid("Invalid product ID"),
});

export const idParamSchema = z.object({
  id: queryInteger(),
});
