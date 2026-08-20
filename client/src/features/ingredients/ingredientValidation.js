import { z } from "zod";

/**
 * Ingredient Validation Schemas
 *
 * Used by react-hook-form with ZodResolver.
 */

// Create ingredient form
export const createIngredientSchema = z.object({
  ingredient_name: z
    .string()
    .min(1, "Ingredient name is required")
    .max(150, "Must not exceed 150 characters"),
  unit: z
    .string()
    .min(1, "Unit is required")
    .max(50, "Must not exceed 50 characters"),
  minimum_threshold: z
    .number()
    .min(0, "Cannot be negative")
    .optional(),
});

// Edit ingredient form (same as create, all fields optional for partial update)
export const editIngredientSchema = z.object({
  ingredient_name: z
    .string()
    .min(1, "Ingredient name is required")
    .max(150, "Must not exceed 150 characters")
    .optional(),
  unit: z
    .string()
    .min(1, "Unit is required")
    .max(50, "Must not exceed 50 characters")
    .optional(),
  minimum_threshold: z
    .number()
    .min(0, "Cannot be negative")
    .optional(),
});

// Restock form
export const restockSchema = z.object({
  quantity_added: z
    .number()
    .positive("Quantity must be greater than zero"),
  total_cost: z
    .number()
    .min(0, "Cost cannot be negative"),
  supplier_name: z
    .string()
    .max(150, "Must not exceed 150 characters")
    .optional(),
  notes: z
    .string()
    .max(500, "Must not exceed 500 characters")
    .optional(),
});

// Declare loss form
export const lossSchema = z.object({
  loss_type: z.enum(["spoilage", "spillage", "expiry", "other"], {
    required_error: "Loss type is required",
  }),
  quantity_lost: z
    .number()
    .positive("Quantity must be greater than zero"),
  batch_id: z.number().int().positive().optional(),
  total_cost: z.number().min(0).optional(),
  notes: z
    .string()
    .max(500, "Must not exceed 500 characters")
    .optional(),
});

// Unit options for the select dropdown
export const UNIT_OPTIONS = [
  { value: "g", label: "g (grams)" },
  { value: "kg", label: "kg (kilograms)" },
  { value: "ml", label: "ml (milliliters)" },
  { value: "L", label: "L (liters)" },
  { value: "pcs", label: "pcs (pieces)" },
  { value: "tbsp", label: "tbsp (tablespoon)" },
  { value: "tsp", label: "tsp (teaspoon)" },
];
