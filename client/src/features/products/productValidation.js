import { z } from "zod";

/**
 * Product Validation Schemas
 *
 * Used by react-hook-form with ZodResolver.
 * Separate schemas for create vs edit modes.
 */

// ── Nested Schemas ────────────────────────────────

const recipeEntrySchema = z.object({
  ingredient_id: z.string().uuid("Select an ingredient"),
  quantity_needed: z.number().positive("Quantity must be greater than zero"),
});

const variantEntrySchema = z.object({
  variant_id: z.number().int().positive().optional(),
  size_name: z
    .string()
    .min(1, "Size name is required")
    .max(50, "Must not exceed 50 characters"),
  price: z.number().positive("Price must be greater than zero"),
  is_available: z.boolean().optional().default(true),
  recipes: z
    .array(recipeEntrySchema)
    .min(1, "At least one ingredient is required"),
});

// ── Product Schemas ───────────────────────────────

// Create product form — all fields required
export const createProductSchema = z.object({
  product_name: z
    .string()
    .min(1, "Product name is required")
    .max(150, "Must not exceed 150 characters"),
  subcategory_id: z.number({ required_error: "Category is required" }),
  description: z
    .string()
    .max(500, "Must not exceed 500 characters")
    .optional()
    .or(z.literal("")),
  image_url: z.string().optional().or(z.literal("")),
  is_available: z.boolean().optional().default(true),
  variants: z
    .array(variantEntrySchema)
    .min(1, "At least one variant is required"),
});

// Edit product form — all fields optional for partial update
export const editProductSchema = z.object({
  product_name: z
    .string()
    .min(1, "Product name is required")
    .max(150, "Must not exceed 150 characters")
    .optional(),
  subcategory_id: z.number().optional(),
  description: z
    .string()
    .max(500, "Must not exceed 500 characters")
    .optional()
    .or(z.literal("")),
  image_url: z.string().optional().or(z.literal("")).nullable(),
  is_available: z.boolean().optional(),
  variants: z
    .array(variantEntrySchema)
    .min(1, "At least one variant is required"),
});

// ── Category Schemas ─────────────────────────────

export const createCategorySchema = z.object({
  subcategory_name: z
    .string()
    .min(1, "Category name is required")
    .max(100, "Must not exceed 100 characters"),
  description: z
    .string()
    .max(500, "Must not exceed 500 characters")
    .optional()
    .or(z.literal("")),
});

export const editCategorySchema = z.object({
  subcategory_name: z
    .string()
    .min(1, "Category name is required")
    .max(100, "Must not exceed 100 characters")
    .optional(),
  description: z
    .string()
    .max(500, "Must not exceed 500 characters")
    .optional()
    .or(z.literal("")),
});
