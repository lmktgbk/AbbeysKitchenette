import { z } from "zod";

/**
 * Ingredient Validation Schemas
 *
 * Used by validate middleware to validate request bodies.
 * If validation fails → error response, controller never executes.
 */

// Used by POST /api/ingredients — create ingredient
export const createIngredientSchema = z.object({
  ingredient_name: z
    .string()
    .min(1, "Ingredient name is required")
    .max(150, "Ingredient name must not exceed 150 characters"),
  unit: z
    .string()
    .min(1, "Unit is required")
    .max(50, "Unit must not exceed 50 characters"),
  minimum_threshold: z
    .number()
    .min(0, "Minimum threshold cannot be negative")
    .optional(),
});

// Used by PATCH /api/ingredients/:id/archive, /:id/restore, DELETE /api/ingredients/:id
export const idParamSchema = z.object({
  id: z.string().uuid("Invalid ingredient ID"),
});
