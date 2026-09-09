import { z } from "zod";

/**
 * Category Validation Schemas
 *
 * Two-table model: categories (root) + subcategories.
 * Root categories are read-only (managed via SQL).
 * Only subcategory schemas are needed for API validation.
 */

// POST /api/categories/:id/subcategories — create subcategory
export const createSubcategorySchema = z.object({
  subcategory_name: z
    .string()
    .min(1, "Subcategory name is required")
    .max(100, "Subcategory name must not exceed 100 characters"),
  description: z
    .string()
    .max(500, "Description must not exceed 500 characters")
    .optional(),
});

// PATCH /api/subcategories/:id — update subcategory
export const updateSubcategorySchema = z.object({
  subcategory_name: z
    .string()
    .min(1, "Subcategory name cannot be empty")
    .max(100, "Subcategory name must not exceed 100 characters")
    .optional(),
  description: z
    .string()
    .max(500, "Description must not exceed 500 characters")
    .optional(),
  is_active: z.boolean().optional(),
});
