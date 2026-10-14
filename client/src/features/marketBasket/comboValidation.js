import { z } from "zod";

/**
 * createComboSchema — Create Promotion form validation.
 * WHY no category field: bundles are always assigned to the system-owned
 * Bundles/Bundle subcategory server-side (is_bundle flag), so staff never picks one.
 */
export const createComboSchema = z.object({
  name: z
    .string()
    .min(1, "Product name is required")
    .max(150, "Must not exceed 150 characters"),
  description: z
    .string()
    .max(500, "Must not exceed 500 characters")
    .optional()
    .or(z.literal("")),
  price: z.number().positive("Price must be greater than zero"),
});
