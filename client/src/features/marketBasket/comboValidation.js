import { z } from "zod";

export const createComboSchema = z.object({
  name: z
    .string()
    .min(1, "Product name is required")
    .max(150, "Must not exceed 150 characters"),
  categoryId: z.string().min(1, "Category is required"),
  description: z
    .string()
    .max(500, "Must not exceed 500 characters")
    .optional()
    .or(z.literal("")),
  price: z.number().positive("Price must be greater than zero"),
});
