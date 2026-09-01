import { z } from "zod";

export const generateSchema = z.object({
  productId: z.string().uuid("Invalid product ID"),
});

export const idParamSchema = z.object({
  id: z.string().regex(/^\d+$/, "ID must be a number"),
});
